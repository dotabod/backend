import { t } from 'i18next'

import { getPlayers } from '../../dota/lib/getPlayers.js'
import { getRankDetail, rankTierToMmr } from './ranks.js'

export async function calculateAvg(
  locale: string,
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const { cards } = await getPlayers(locale, currentMatchId, players)

  const mmrs: number[] = []
  const leaderranks: number[] = []
  cards.forEach((card) => {
    mmrs.push(rankTierToMmr(card.rank_tier))
    leaderranks.push(card.leaderboard_rank)
  })

  // Get average of all numbers in mmrs array
  const avg = Math.round(mmrs.reduce((a, b) => a + b, 0) / mmrs.length)
  const avgLeader = Math.round(leaderranks.reduce((a, b) => a + b, 0) / leaderranks.length)
  const avgMsg = ` - ${t('averageRank', { lng: locale })}`
  const rank = await getRankDetail(avg)

  if (!rank) return `${avg || `#${avgLeader}`}${avgMsg}`

  if ('standing' in rank) {
    return `Immortal${avgMsg}`
  }

  return `${avg} · ${rank.myRank.title}${avgMsg}`
}
