import { t } from 'i18next'

import type { Database } from './supabase-types.js'
import supabase from './supabase.js'

interface WL {
  lng: string
  channelId: string
  mmrEnabled: false
  startDate?: Date | null
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

export async function getWL({ lng, channelId, mmrEnabled, startDate, currentGameIsRanked }: WL) {
  if (!channelId) {
    return Promise.resolve({ record: [{ win: 0, lose: 0, type: 'U' }], msg: null })
  }

  const { data: matches, error } = await supabase.rpc('get_grouped_bets', {
    channel_id: channelId,
    start_date:
      startDate?.toISOString() ??
      new Date(new Date().getTime() - 12 * 60 * 60 * 1000).toISOString(),
  })

  if (error) {
    return { record: [{ win: 0, lose: 0, type: 'U' }], msg: null }
  }

  const ranked: { win: number; lose: number; mmr: number } = { win: 0, lose: 0, mmr: 0 }
  const unranked: { win: number; lose: number } = { win: 0, lose: 0 }

  matches.forEach((match) => {
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

  const msg = messages.filter(Boolean).join(' · ') || '0 W - 0 L'

  return { record, msg }
}
