import { logger, supabase } from '@dotabod/shared-utils'
import type { Database } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../settings'
import type { SocketClient } from '../types'
import {
  getWinLossChallenge,
  getWinLossStartDate,
  normalizeStatsDays,
  WL_RESET_SETTING_KEY,
} from './win-loss-window'

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

type GroupedBet = Database['public']['Functions']['get_grouped_bets']['Returns'][0]

interface WinLossStats {
  lose: number
  win: number
}

interface RankedWinLossStats extends WinLossStats {
  mmr: number
}

interface CalculatedStats {
  ranked: RankedWinLossStats
  unranked: WinLossStats
}

interface WinLossRecord extends WinLossStats {
  type: 'R' | 'U'
}

export const LOBBY_TYPE_RANKED = 7
export const MULTIPLIER_PARTY = 20
export const MULTIPLIER_SOLO = 25
const DAY_MS = 24 * 60 * 60 * 1000

const clearCompletedChallenge = async function clearCompletedChallenge(
  userId: string,
  settings?: SocketClient['settings']
) {
  const updatedAt = new Date().toISOString()
  const values = [
    { key: DBSettings.wlStatsDays, updated_at: updatedAt, userId, value: null },
    { key: DBSettings.wlStatsStartDate, updated_at: updatedAt, userId, value: null },
  ]
  const { error } = await supabase.from('settings').upsert(values, { onConflict: 'userId, key' })

  if (error) {
    logger.error('[WL] Error clearing completed challenge', { error, userId })
    return
  }

  for (const { key } of values) {
    const setting = settings?.find((entry) => entry.key === key)
    if (setting) {
      setting.value = null
    }
  }
}

const getAvailableStatsDays = function getAvailableStatsDays(
  statsDays: number | null,
  firstMatchAt?: string
): number | null {
  if (statsDays === null || firstMatchAt === undefined || firstMatchAt.length === 0) {
    return statsDays
  }

  const firstMatch = new Date(firstMatchAt)
  if (!Number.isFinite(firstMatch.getTime())) {
    return statsDays
  }

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const firstMatchDay = Date.UTC(
    firstMatch.getUTCFullYear(),
    firstMatch.getUTCMonth(),
    firstMatch.getUTCDate()
  )
  const elapsedDays = Math.max(1, Math.floor((today - firstMatchDay) / DAY_MS))
  return Math.min(statsDays, elapsedDays)
}

const updateStats = (
  stats: WinLossStats & { mmr?: number },
  match: GroupedBet,
  multiplier: number
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

const hasUserId = function hasUserId(userId?: string): userId is string {
  return userId !== undefined && userId.length > 0
}

const hasStatsOverride = function hasStatsOverride(
  statsDaysOverride: number | null | undefined,
  statsStartDateOverride: string | null | undefined
): boolean {
  return statsDaysOverride !== undefined || statsStartDateOverride !== undefined
}

const getConfiguredStatsDays = function getConfiguredStatsDays({
  statsDaysOverride,
  settings,
  subscription,
}: Pick<WL, 'settings' | 'statsDaysOverride' | 'subscription'>): number | null {
  if (statsDaysOverride !== undefined) {
    return normalizeStatsDays(statsDaysOverride)
  }
  return normalizeStatsDays(getValueOrDefault(DBSettings.wlStatsDays, settings, subscription))
}

const getConfiguredStatsStartDate = function getConfiguredStatsStartDate({
  statsStartDateOverride,
  settings,
  subscription,
}: Pick<WL, 'settings' | 'statsStartDateOverride' | 'subscription'>): string | null {
  if (statsStartDateOverride !== undefined) {
    return statsStartDateOverride
  }
  return getValueOrDefault(DBSettings.wlStatsStartDate, settings, subscription)
}

const getAdjustmentResult = async function getAdjustmentResult(
  userId: string | undefined,
  startDate: string
) {
  if (!hasUserId(userId)) {
    return { data: [], error: null }
  }
  return await supabase
    .from('win_loss_adjustments')
    .select('won, lobby_type, delta')
    .eq('user_id', userId)
    .gte('created_at', startDate)
}

const getFirstMatchResult = async function getFirstMatchResult(
  activeStatsDays: number | null,
  activeChallenge: ReturnType<typeof getWinLossChallenge>,
  userId: string | undefined,
  startDate: string
) {
  if (activeStatsDays === null || activeChallenge !== null || !hasUserId(userId)) {
    return { data: [], error: null }
  }
  return await supabase
    .from('matches')
    .select('created_at')
    .eq('userId', userId)
    .not('won', 'is', null)
    .in('lobby_type', [0, 7])
    .gte('created_at', startDate)
    .order('created_at', { ascending: true })
    .limit(1)
}

const getAvailableStatsDaysFromQuery = function getAvailableStatsDaysFromQuery(
  activeChallenge: ReturnType<typeof getWinLossChallenge>,
  activeStatsDays: number | null,
  firstMatchResult: Awaited<ReturnType<typeof getFirstMatchResult>>
): number | null {
  if (activeChallenge !== null) {
    return activeChallenge.elapsedDays
  }
  if (firstMatchResult.error) {
    return activeStatsDays
  }
  return getAvailableStatsDays(activeStatsDays, firstMatchResult.data?.at(0)?.created_at)
}

const getMatchMultiplier = function getMatchMultiplier(match: GroupedBet): number {
  if (match.lobby_type !== LOBBY_TYPE_RANKED) {
    return 0
  }
  return match.is_party ? MULTIPLIER_PARTY : MULTIPLIER_SOLO
}

const clampStats = function clampStats(stats: WinLossStats): void {
  stats.win = Math.max(0, stats.win)
  stats.lose = Math.max(0, stats.lose)
}

const calculateStats = function calculateStats(
  matches: GroupedBet[],
  adjustmentResult: Awaited<ReturnType<typeof getAdjustmentResult>>
): CalculatedStats {
  const ranked = { lose: 0, mmr: 0, win: 0 }
  const unranked = { lose: 0, win: 0 }

  for (const match of matches) {
    const stats = match.lobby_type === LOBBY_TYPE_RANKED ? ranked : unranked
    updateStats(stats, match, getMatchMultiplier(match))
  }

  if (!adjustmentResult.error) {
    for (const adjustment of adjustmentResult.data ?? []) {
      const stats = adjustment.lobby_type === LOBBY_TYPE_RANKED ? ranked : unranked
      if (adjustment.won) {
        stats.win += adjustment.delta
      } else {
        stats.lose += adjustment.delta
      }
    }
  }

  clampStats(ranked)
  clampStats(unranked)
  return { ranked, unranked }
}

const buildRecord = function buildRecord(
  ranked: RankedWinLossStats,
  unranked: WinLossStats
): WinLossRecord[] {
  const record: WinLossRecord[] = []
  if (ranked.win + ranked.lose !== 0) {
    record.push({ lose: ranked.lose, type: 'R', win: ranked.win })
  }
  if (unranked.win + unranked.lose !== 0) {
    record.push({ lose: unranked.lose, type: 'U', win: unranked.win })
  }
  if (record.length === 0) {
    record.push({ lose: 0, type: 'U', win: 0 })
  }
  return record
}

const getMmrMessage = function getMmrMessage(mmrEnabled: boolean, mmr: number): string {
  if (!mmrEnabled) {
    return ''
  }
  const sign = mmr >= 0 ? '+' : ''
  return ` | ${sign}${mmr} MMR`
}

interface RecordMessageOptions {
  currentGameIsRanked?: boolean | null
  hasRanked: boolean
  hasUnranked: boolean
  rankedMessage: string
  unrankedMessage: string
}

const buildRecordMessage = function buildRecordMessage({
  currentGameIsRanked,
  hasRanked,
  hasUnranked,
  rankedMessage,
  unrankedMessage,
}: RecordMessageOptions): string {
  const messages: string[] = []
  if (currentGameIsRanked === false) {
    if (hasUnranked) {
      messages.push(unrankedMessage)
    }
    if (hasRanked) {
      messages.push(rankedMessage)
    }
  } else {
    if (hasRanked) {
      messages.push(rankedMessage)
    }
    if (hasUnranked) {
      messages.push(unrankedMessage)
    }
  }
  return messages.join(' · ') || '0 W - 0 L'
}

const getWindowMessage = function getWindowMessage(
  lng: string,
  availableStatsDays: number | null,
  statsDaysTotal: number | null
): string {
  if (availableStatsDays === null) {
    return t('wl.statsWindow_stream', { lng })
  }
  if (statsDaysTotal !== null) {
    return t('wl.statsChallenge', {
      count: statsDaysTotal,
      elapsed: availableStatsDays,
      lng,
    })
  }
  return t('wl.statsWindow', { count: availableStatsDays, lng })
}

export const getWL = async function getWL({
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
  const statsDays = getConfiguredStatsDays({ settings, statsDaysOverride, subscription })
  const statsStartDate = getConfiguredStatsStartDate({
    settings,
    statsStartDateOverride,
    subscription,
  })
  const challenge = getWinLossChallenge(statsDays, statsStartDate, now)
  const isPreviewOverride = hasStatsOverride(statsDaysOverride, statsStartDateOverride)
  const activeChallenge = challenge?.expired === true ? null : challenge
  const activeStatsDays = challenge?.expired === true ? null : statsDays

  if (challenge?.expired === true && hasUserId(userId) && !isPreviewOverride) {
    await clearCompletedChallenge(userId, settings)
  }

  if (!channelId) {
    return {
      msg: null,
      record: [{ lose: 0, type: 'U', win: 0 }],
      statsDays: activeChallenge?.elapsedDays ?? activeStatsDays,
      statsDaysTotal: activeChallenge?.totalDays ?? null,
    }
  }

  const resetAt = settings?.find((setting) => setting.key === WL_RESET_SETTING_KEY)?.value
  const startDate = getWinLossStartDate(
    activeStatsDays,
    streamStartDate,
    resetAt,
    now,
    activeChallenge?.startDate
  ).toISOString()

  const [matchResult, adjustmentResult, firstMatchResult] = await Promise.all([
    supabase.rpc('get_grouped_bets', {
      channel_id: channelId,
      start_date: startDate,
    }),
    getAdjustmentResult(userId, startDate),
    getFirstMatchResult(activeStatsDays, activeChallenge, userId, startDate),
  ])

  const availableStatsDays = getAvailableStatsDaysFromQuery(
    activeChallenge,
    activeStatsDays,
    firstMatchResult
  )
  const statsDaysTotal = activeChallenge?.totalDays ?? null

  if (matchResult.error) {
    return {
      msg: null,
      record: [{ lose: 0, type: 'U', win: 0 }],
      statsDays: availableStatsDays,
      statsDaysTotal,
    }
  }

  const { ranked, unranked } = calculateStats(matchResult.data, adjustmentResult)

  const hasUnranked = unranked.win + unranked.lose !== 0
  const hasRanked = ranked.win + ranked.lose !== 0

  const record = buildRecord(ranked, unranked)

  const mmrMsg = getMmrMessage(mmrEnabled, ranked.mmr)
  const rankedMsg = `${t('ranked', { lng })} ${ranked.win} W - ${ranked.lose} L${mmrMsg}`
  const unrankedMsg = `${t('unranked', { lng })} ${unranked.win} W - ${unranked.lose} L`

  const recordMessage = buildRecordMessage({
    currentGameIsRanked,
    hasRanked,
    hasUnranked,
    rankedMessage: rankedMsg,
    unrankedMessage: unrankedMsg,
  })
  const windowMessage = getWindowMessage(lng, availableStatsDays, statsDaysTotal)
  const msg = `${recordMessage} · ${windowMessage}`

  return { msg, record, statsDays: availableStatsDays, statsDaysTotal }
}
