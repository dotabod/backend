import { t } from 'i18next'

import { logger } from '../../utils/logger.js'
import { server } from '../index.js'
import { leaderRanks, ranks } from './consts.js'

export function rankTierToMmr(rankTier: string | number) {
  if (!Number(rankTier)) {
    return 0
  }
  const intRankTier = Number(rankTier)

  // Floor to 5
  const stars = intRankTier % 10 > 5 ? 5 : intRankTier % 10
  const rank = ranks.find((rank) =>
    rank.image.startsWith(`${Math.floor(Number(intRankTier / 10))}${stars}`),
  )

  // Middle of range
  return ((rank?.range[0] ?? 0) + (rank?.range[1] ?? 0)) / 2
}

export async function lookupLeaderRank(mmr: number, steam32Id?: number | null) {
  let standing: null | number = null
  const lowestImmortalRank = leaderRanks[leaderRanks.length - 1]
  const defaultNotFound = { myRank: lowestImmortalRank, mmr, standing }

  // Not everyone has a steam32Id saved yet
  // The dota2 gsi should save one for us
  if (!steam32Id) {
    return defaultNotFound
  }

  try {
    standing = await server.dota.getCard(steam32Id).then((data) => data?.leaderboard_rank as number)

    if (!standing) {
      return defaultNotFound
    }

    const [myRank] = leaderRanks.filter(
      (rank) => typeof standing === 'number' && standing <= rank.range[1],
    )
    return { myRank, mmr, standing }
  } catch (e) {
    logger.error('[lookupLeaderRank] Error fetching leaderboard rank', { e, steam32Id })
    return defaultNotFound
  }
}

export async function getRankDetail(mmr: string | number, steam32Id?: number | null) {
  const mmrNum = Number(mmr)

  if (!mmrNum || mmrNum < 0) return null

  // Higher than max mmr? Lets check leaderboards
  if (mmrNum > ranks[ranks.length - 1].range[1]) {
    return lookupLeaderRank(mmrNum, steam32Id)
  }

  const [myRank, nextRank] = ranks.filter((rank) => mmrNum <= rank.range[1])

  // Its not always truthy, nextRank can be beyond the range
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const nextMMR = nextRank?.range[0] || myRank?.range[1]
  const mmrToNextRank = nextMMR - mmrNum
  const winsToNextRank = Math.ceil(mmrToNextRank / 30)

  return {
    mmr: mmrNum,
    myRank,
    nextRank,
    nextMMR,
    mmrToNextRank,
    winsToNextRank,
  }
}

interface RankDescription {
  locale: string
  mmr: string | number
  steam32Id?: number
  showRankMmr: boolean
}

// Used for chatting !mmr
export async function getRankDescription({
  locale,
  mmr,
  steam32Id,
  showRankMmr = true,
}: RankDescription) {
  const rankResponse = await getRankDetail(mmr, steam32Id)

  if (!rankResponse) return null

  if ('standing' in rankResponse) {
    const rankTitle = 'Immortal'
    const standing = rankResponse.standing && `#${rankResponse.standing}`
    const msgs = []

    if (showRankMmr) msgs.push(`${mmr} MMR`)
    msgs.push(rankTitle)
    if (standing) msgs.push(standing)

    return msgs.join(' · ')
  }

  const { myRank, nextMMR, mmrToNextRank, winsToNextRank } = rankResponse

  if (!showRankMmr) {
    return myRank.title
  }

  const count = mmrToNextRank <= 30 ? 1 : winsToNextRank
  const nextAt = t('rank.nextRankAt', { lng: locale })
  const nextIn = t('rank.nextRankIn', {
    count,
    lng: locale,
  })

  const msgs = []
  msgs.push(mmr)
  msgs.push(myRank.title)
  msgs.push(`${nextAt} ${nextMMR}${count !== 1 ? ` ${nextIn}` : ''}`)
  if (count === 1) msgs.push(nextIn)

  return msgs.join(' · ')
}
