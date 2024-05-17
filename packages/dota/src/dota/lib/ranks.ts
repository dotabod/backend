import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import { steamSocket } from '../../steam/ws.js'
import type { Cards } from '../../types.js'
import { logger } from '../../utils/logger.js'
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

interface LeaderRankData {
  myRank: {
    range: number[]
    image: string
    sparklingEffect: boolean
  }
  mmr: number
  standing: number | null
}

export async function lookupLeaderRank(
  mmr: number,
  steam32Id?: number | null,
): Promise<LeaderRankData> {
  const defaultNotFound: LeaderRankData = {
    myRank: leaderRanks[leaderRanks.length - 1],
    mmr,
    standing: null,
  }

  // Return default values if steam32Id is undefined or null
  if (!steam32Id) {
    return defaultNotFound
  }

  const cacheKey = `${steam32Id}:medal`
  let result

  const redisClient = RedisClient.getInstance()
  // Try to get the cached result first
  const medalCache = await redisClient.client.json.get(cacheKey)
  if (medalCache) {
    result = medalCache as unknown as LeaderRankData
  } else {
    try {
      const getCardPromise = new Promise<Cards>((resolve, reject) => {
        steamSocket.emit('getCard', steam32Id, (err: any, card: Cards) => {
          if (err) {
            reject(err)
          } else {
            resolve(card)
          }
        })
      })

      // Fetch the leaderboard rank from the Dota 2 server
      const data = await getCardPromise
      const standing: number = data?.leaderboard_rank

      // If the rank is not available, return default values
      if (!standing || typeof standing !== 'number') {
        return defaultNotFound
      }

      // Find the corresponding leaderboard rank for the given standing
      const myRank =
        leaderRanks.find((rank) => standing <= rank.range[1]) || leaderRanks[leaderRanks.length - 1]

      // Construct the result object
      result = { myRank, mmr, standing }

      // Cache the result
      await redisClient.client.json.set(cacheKey, '$', result)
    } catch (e) {
      logger.error('[lookupLeaderRank] Error fetching leaderboard rank', { e, steam32Id })
      return defaultNotFound
    }
  }

  return result
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
  const winsToNextRank = Math.ceil(mmrToNextRank / 25)

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

  const count = mmrToNextRank <= 25 ? 1 : winsToNextRank
  const nextAt = t('rank.nextRankAt', { lng: locale })
  const nextIn = t('rank.nextRankIn', {
    emote: 'peepoClap',
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
