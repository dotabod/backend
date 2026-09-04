import { type Database, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../settings'
import type { SocketClient } from '../types'
import { getWinLossStartDate, normalizeStatsDays, WL_RESET_SETTING_KEY } from './winLossWindow'

interface WL {
  lng: string
  channelId: string
  mmrEnabled: boolean
  settings?: SocketClient['settings']
  subscription?: SocketClient['subscription']
  streamStartDate?: Date | null
  currentGameIsRanked?: boolean | null
}

export const LOBBY_TYPE_RANKED = 7
export const MULTIPLIER_PARTY = 20
export const MULTIPLIER_SOLO = 25

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
}: WL) {
  const statsDays = normalizeStatsDays(
    getValueOrDefault(DBSettings.wlStatsDays, settings, subscription),
  )

  if (!channelId) {
    return Promise.resolve({
      record: [{ win: 0, lose: 0, type: 'U' }],
      msg: null,
      statsDays,
    })
  }

  const resetAt = settings?.find((setting) => setting.key === WL_RESET_SETTING_KEY)?.value

  const { data: matches, error } = await supabase.rpc('get_grouped_bets', {
    channel_id: channelId,
    start_date: getWinLossStartDate(statsDays, streamStartDate, resetAt).toISOString(),
  })

  if (error) {
    return { record: [{ win: 0, lose: 0, type: 'U' }], msg: null, statsDays }
  }

  const ranked: { win: number; lose: number; mmr: number } = {
    win: 0,
    lose: 0,
    mmr: 0,
  }
  const unranked: { win: number; lose: number } = { win: 0, lose: 0 }

  matches.forEach((match: Database['public']['Functions']['get_grouped_bets']['Returns'][0]) => {
    const isRanked = match.lobby_type === LOBBY_TYPE_RANKED
    const stats = isRanked ? ranked : unranked
    const multiplier = isRanked ? (match.is_party ? MULTIPLIER_PARTY : MULTIPLIER_SOLO) : 0

    updateStats(stats, match, multiplier)
  })

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
  const windowMessage =
    statsDays === null
      ? t('wl.statsWindow_stream', { lng })
      : t('wl.statsWindow', { count: statsDays, lng })
  const msg = `${recordMessage} · ${windowMessage}`

  return { record, msg, statsDays }
}
