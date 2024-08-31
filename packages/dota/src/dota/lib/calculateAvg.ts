import { getPlayers } from '../../dota/lib/getPlayers.js'
import type { Players } from '../../types'
import { getRankDetail, rankTierToMmr } from './ranks.js'

interface Avg {
  locale: string
  currentMatchId?: string
  players?: Players
}

function calculateAverage(numbers: number[]): number {
  const validNumbers = numbers.filter(Boolean)
  const sum = validNumbers.reduce((a, b) => a + b, 0)
  return Math.round(sum / validNumbers.length)
}

async function getRankTitle(
  avg: number,
  avgLeader: number,
  averageMmrPostfix: string,
): Promise<string> {
  const rank = await getRankDetail(avg)
  if (!rank && !avgLeader) return `Immortal${averageMmrPostfix}`
  if (!rank) return `${avg || `#${avgLeader}${averageMmrPostfix}`}`
  if (avgLeader) return `#${avgLeader}${averageMmrPostfix}`
  if ('standing' in rank) {
    return `Immortal${averageMmrPostfix}`
  }
  return `${avg} · ${rank.myRank.title}${averageMmrPostfix}`
}

export async function calculateAvg({ locale, currentMatchId, players }: Avg): Promise<string> {
  const { cards, average_mmr } = await getPlayers({ locale, currentMatchId, players })

  const mmrs: number[] = []
  const leaderranks: number[] = []
  cards.forEach((card) => {
    mmrs.push(rankTierToMmr(card.rank_tier))
    leaderranks.push(card.leaderboard_rank)
  })

  const avg = calculateAverage(mmrs)
  const avgLeader = calculateAverage(leaderranks)
  const averageMmrPostfix = average_mmr ? ` · ${average_mmr} MMR` : ''

  return getRankTitle(avg, avgLeader, averageMmrPostfix)
}
