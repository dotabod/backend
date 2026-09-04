import { type Database, logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../settings'
import type { SocketClient } from '../types'
import {
  getWinLossChallenge,
  getWinLossStartDate,
  normalizeStatsDays,
  WL_RESET_SETTING_KEY,
} from './winLossWindow'

interface WL {
  lng: string
  channelId: string
  mmrEnabled: boolean
  settings?: SocketClient['settings']
  subscription?: SocketClient['subscription']
  streamStartDate?: Date | null
  currentGameIsRanked?: boolean | null
  statsDaysOverride?: number | null
  statsStartDateOverride?: string | null
  userId?: string
}

export const LOBBY_TYPE_RANKED = 7
export const MULTIPLIER_PARTY = 20
export const MULTIPLIER_SOLO = 25
const DAY_MS = 24 * 60 * 60 * 1000

async function clearCompletedChallenge(userId: string, settings?: SocketClient['settings']) {
  const updatedAt = new Date().toISOString()
  const values = [
    { key: DBSettings.wlStatsDays, userId, updated_at: updatedAt, value: null },
    { key: DBSettings.wlStatsStartDate, userId, updated_at: updatedAt, value: null },
  ]
  const { error } = await supabase.from('settings').upsert(values, { onConflict: 'userId, key' })

  if (error) {
    logger.error('[WL] Error clearing completed challenge', { error, userId })
    return
  }

  for (const { key } of values) {
    const setting = settings?.find((entry) => entry.key === key)
    if (setting) setting.value = null
  }
}

function getAvailableStatsDays(statsDays: number | null, firstMatchAt?: string): number | null {
  if (statsDays === null || !firstMatchAt) return statsDays

  const firstMatch = new Date(firstMatchAt)
  if (!Number.isFinite(firstMatch.getTime())) return statsDays

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const firstMatchDay = Date.UTC(
    firstMatch.getUTCFullYear(),
    firstMatch.getUTCMonth(),
    firstMatch.getUTCDate(),
  )
  const elapsedDays = Math.max(1, Math.floor((today - firstMatchDay) / DAY_MS))
  return Math.min(statsDays, elapsedDays)
}

const updateStats = (
  stats: {
    win: number
    lose: number
    mmr?: number
  },
  match: Database['public']['Functions']['get_grouped_bets']['Returns'][0],
  multiplier: number,
) => {
  if (match.won) {
    stats.win += match._count_won
  } else {
    stats.lose += match._count_won
  }

  if (stats.mmr !== undefined) {
    const wonMulti = match._count_won * (match.won ? 1 : -1)
    stats.mmr += wonMulti * (match.is_doubledown ? multiplier * 2 : multiplier)
  }
}

export async function getWL({
  lng,
  channelId,
  mmrEnabled,
  settings,
  subscription,
  streamStartDate,
  currentGameIsRanked,
  statsDaysOverride,
  statsStartDateOverride,
  userId,
}: WL) {
  const now = new Date()
  const statsDays = normalizeStatsDays(
    statsDaysOverride === undefined
      ? getValueOrDefault(DBSettings.wlStatsDays, settings, subscription)
      : statsDaysOverride,
  )
  const statsStartDate =
    statsStartDateOverride === undefined
      ? getValueOrDefault(DBSettings.wlStatsStartDate, settings, subscription)
      : statsStartDateOverride
  const challenge = getWinLossChallenge(statsDays, statsStartDate, now)
  const isPreviewOverride = statsDaysOverride !== undefined || statsStartDateOverride !== undefined
  const activeChallenge = challenge?.expired ? null : challenge
  const activeStatsDays = challenge?.expired ? null : statsDays

  if (challenge?.expired && userId && !isPreviewOverride) {
    await clearCompletedChallenge(userId, settings)
  }

  if (!channelId) {
    return Promise.resolve({
      record: [{ win: 0, lose: 0, type: 'U' }],
      msg: null,
      statsDays: activeChallenge?.elapsedDays ?? activeStatsDays,
      statsDaysTotal: activeChallenge?.totalDays ?? null,
    })
  }

  const resetAt = settings?.find((setting) => setting.key === WL_RESET_SETTING_KEY)?.value
  const startDate = getWinLossStartDate(
    activeStatsDays,
    streamStartDate,
    resetAt,
    now,
    activeChallenge?.startDate,
  ).toISOString()

  const [matchResult, adjustmentResult, firstMatchResult] = await Promise.all([
    supabase.rpc('get_grouped_bets', {
      channel_id: channelId,
      start_date: startDate,
    }),
    userId
      ? supabase
          .from('win_loss_adjustments')
          .select('won, lobby_type, delta')
          .eq('user_id', userId)
          .gte('created_at', startDate)
      : Promise.resolve({ data: [], error: null }),
    activeStatsDays !== null && !activeChallenge && userId
      ? supabase
          .from('matches')
          .select('created_at')
          .eq('userId', userId)
          .not('won', 'is', null)
          .in('lobby_type', [0, 7])
          .gte('created_at', startDate)
          .order('created_at', { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ])

  const availableStatsDays = activeChallenge
    ? activeChallenge.elapsedDays
    : firstMatchResult.error
      ? activeStatsDays
      : getAvailableStatsDays(activeStatsDays, firstMatchResult.data?.[0]?.created_at)
  const statsDaysTotal = activeChallenge?.totalDays ?? null

  if (matchResult.error) {
    return {
      record: [{ win: 0, lose: 0, type: 'U' }],
      msg: null,
      statsDays: availableStatsDays,
      statsDaysTotal,
    }
  }

  const ranked: { win: number; lose: number; mmr: number } = {
    win: 0,
    lose: 0,
    mmr: 0,
  }
  const unranked: { win: number; lose: number } = { win: 0, lose: 0 }

  matchResult.data.forEach(
    (match: Database['public']['Functions']['get_grouped_bets']['Returns'][0]) => {
      const isRanked = match.lobby_type === LOBBY_TYPE_RANKED
      const stats = isRanked ? ranked : unranked
      const multiplier = isRanked ? (match.is_party ? MULTIPLIER_PARTY : MULTIPLIER_SOLO) : 0

      updateStats(stats, match, multiplier)
    },
  )

  if (!adjustmentResult.error) {
    adjustmentResult.data?.forEach((adjustment) => {
      const stats = adjustment.lobby_type === LOBBY_TYPE_RANKED ? ranked : unranked
      if (adjustment.won) {
        stats.win += adjustment.delta
      } else {
        stats.lose += adjustment.delta
      }
    })
  }

  for (const stats of [ranked, unranked]) {
    stats.win = Math.max(0, stats.win)
    stats.lose = Math.max(0, stats.lose)
  }

  const hasUnranked = unranked.win + unranked.lose !== 0
  const hasRanked = ranked.win + ranked.lose !== 0

  const record = [
    hasRanked ? { win: ranked.win, lose: ranked.lose, type: 'R' } : null,
    hasUnranked ? { win: unranked.win, lose: unranked.lose, type: 'U' } : null,
    !hasRanked && !hasUnranked ? { win: 0, lose: 0, type: 'U' } : null,
  ].filter(Boolean)

  const mmrMsg = mmrEnabled ? ` | ${ranked.mmr >= 0 ? '+' : ''}${ranked.mmr} MMR` : ''
  const rankedMsg = `${t('ranked', { lng })} ${ranked.win} W - ${ranked.lose} L${mmrMsg}`
  const unrankedMsg = `${t('unranked', { lng })} ${unranked.win} W - ${unranked.lose} L`

  // Order the messages based on current game type - show current game type first
  let messages: (string | null)[]

  if (currentGameIsRanked === true) {
    // Currently in ranked game - show ranked first
    messages = [hasRanked ? rankedMsg : null, hasUnranked ? unrankedMsg : null]
  } else if (currentGameIsRanked === false) {
    // Currently in unranked game - show unranked first
    messages = [hasUnranked ? unrankedMsg : null, hasRanked ? rankedMsg : null]
  } else {
    // Not in a game - show ranked first (default behavior)
    messages = [hasRanked ? rankedMsg : null, hasUnranked ? unrankedMsg : null]
  }

  const recordMessage = messages.filter(Boolean).join(' · ') || '0 W - 0 L'
  const windowMessage = (() => {
    if (availableStatsDays === null) return t('wl.statsWindow_stream', { lng })
    if (statsDaysTotal !== null) {
      return t('wl.statsChallenge', {
        count: statsDaysTotal,
        elapsed: availableStatsDays,
        lng,
      })
    }
    return t('wl.statsWindow', { count: availableStatsDays, lng })
  })()
  const msg = `${recordMessage} · ${windowMessage}`

  return { record, msg, statsDays: availableStatsDays, statsDaysTotal }
}
