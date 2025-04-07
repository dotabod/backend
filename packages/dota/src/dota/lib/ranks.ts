import { t } from 'i18next'

import RedisClient from '../../db/RedisClient.js'
import { MULTIPLIER_SOLO } from '../../db/getWL.js'
import { steamSocket } from '../../steam/ws.js'
import type { Cards } from '../../types.js'
import { logger } from '@dotabod/shared-utils'
import { leaderRanks, ranks } from './consts.js'
import CustomError from '../../utils/customError.js'
import supabase from '../../db/supabase.js'

export function rankTierToMmr(rankTier: string | number) {
  if (!Number(rankTier)) {
    return 0
  }
  const intRankTier = Number(rankTier)

  // Just gonna guess an immortal without standing is 6k mmr
  if (intRankTier > 77) {
    return 6000
  }

  // Floor to 5
  const stars = intRankTier % 10 > 5 ? 5 : intRankTier % 10
  const rank = ranks.find((rank) =>
    rank.image.startsWith(`${Math.floor(Number(intRankTier / 10))}${stars}`),
  )

  // Middle of range
  return ((rank?.range[0] ?? 0) + (rank?.range[1] ?? 0)) / 2
}

/**
 * Converts MMR to rank tier
 * @param mmr - The MMR value to convert
 * @returns The rank tier value (e.g. 71 for Legend 1, 80 for Immortal)
 */
export function mmrToRankTier(mmr: number): number {
  if (mmr <= 0) return 0 // Uncalibrated

  // Immortal rank (rank tier 80)
  // Get the highest MMR from the ranks array
  const highestRankMMR = ranks[ranks.length - 1]?.range[1] || 5619
  if (mmr >= highestRankMMR) return 80

  // Find the rank based on MMR
  for (let i = 0; i < ranks.length; i++) {
    const rank = ranks[i]
    const [min, max] = rank.range

    // If MMR falls within this rank's range
    if (mmr >= min && mmr <= max) {
      // Extract the medal number from the image (first digit)
      const medal = Number.parseInt(rank.image.charAt(0))
      // Extract the stars from the image (second digit)
      const stars = Number.parseInt(rank.image.charAt(1))

      // Calculate rank tier (medal * 10 + stars)
      return medal * 10 + stars
    }
  }

  // Default to uncalibrated if no match found
  return 0
}

export function getRankTitle(rankTier: string | number): string {
  if (!Number(rankTier) || Number(rankTier) <= 0) {
    return 'Uncalibrated'
  }
  const intRankTier = Number(rankTier)

  // Immortal rank
  if (intRankTier > 77) {
    return 'Immortal'
  }

  // Floor to 5
  // Extract the stars value from the rank tier (last digit of the number)
  // If the stars value is greater than 5, cap it at 5 since ranks only go up to 5 stars
  // For example: rank tier 53 means Legend 3, where 5 is the medal and 3 is the stars
  const stars = intRankTier % 10 > 5 ? 5 : intRankTier % 10
  const rank = ranks.find((rank) =>
    rank.image.startsWith(`${Math.floor(Number(intRankTier / 10))}${stars}`),
  )

  return rank?.title ?? 'Unknown'
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
  let result: LeaderRankData

  const redisClient = RedisClient.getInstance()
  // Try to get the cached result first
  const medalCache = await redisClient.client.json.get(cacheKey)
  if (medalCache) {
    result = medalCache as unknown as LeaderRankData
  } else {
    try {
      const getCardPromise = new Promise<Cards>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: 'en' })))
        }, 10000) // 5 second timeout

        steamSocket.emit('getCard', steam32Id, (err: any, card: Cards) => {
          clearTimeout(timeoutId)
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
      await redisClient.client.json.set(cacheKey, '$', result as any)
    } catch (e) {
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
  const winsToNextRank = Math.ceil(mmrToNextRank / MULTIPLIER_SOLO)

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
    const msgs: string[] = []

    if (showRankMmr) msgs.push(`${mmr} MMR`)
    msgs.push(rankTitle)
    if (standing) msgs.push(standing)

    return msgs.join(' · ')
  }

  const { myRank, nextMMR, mmrToNextRank, winsToNextRank } = rankResponse

  if (!showRankMmr) {
    return myRank.title
  }

  const count = mmrToNextRank <= MULTIPLIER_SOLO ? 1 : winsToNextRank
  const nextAt = t('rank.nextRankAt', { lng: locale })
  const nextIn = t('rank.nextRankIn', {
    emote: 'peepoClap',
    count,
    lng: locale,
  })

  const msgs: string[] = []
  msgs.push(String(mmr))
  msgs.push(myRank.title)
  msgs.push(`${nextAt} ${nextMMR}${count !== 1 ? ` ${nextIn}` : ''}`)
  if (count === 1) msgs.push(nextIn)

  return msgs.join(' · ')
}

type Region =
  | 'EUROPE'
  | 'US EAST'
  | 'SINGAPORE'
  | 'ARGENTINA'
  | 'STOCKHOLM'
  | 'AUSTRIA'
  | 'DUBAI'
  | 'PERU'
  | 'BRAZIL'

export function estimateMMR(leaderboard_rank: number, region: Region): number {
  // Max leaderboard rank is 5000
  if (leaderboard_rank <= 0 || leaderboard_rank > 5000) return 8500

  let baseMMR: number
  const x = leaderboard_rank

  if (region === 'EUROPE') {
    baseMMR = 15300 - 8.2 * Math.log(x) * x ** 0.6
  } else if (region === 'US EAST') {
    baseMMR = 14900 - 7.8 * Math.log(x) * x ** 0.6
  } else if (region === 'SINGAPORE') {
    baseMMR = 14750 - 7.6 * Math.log(x) * x ** 0.58
  } else if (region === 'ARGENTINA') {
    baseMMR = 14500 - 7.9 * Math.log(x) * x ** 0.6
  } else if (region === 'STOCKHOLM') {
    baseMMR = 14650 - 7.5 * Math.log(x) * x ** 0.59
  } else if (region === 'AUSTRIA') {
    baseMMR = 14400 - 7.7 * Math.log(x) * x ** 0.61
  } else if (region === 'DUBAI') {
    baseMMR = 14200 - 7.3 * Math.log(x) * x ** 0.6
  } else if (region === 'PERU') {
    baseMMR = 14300 - 7.6 * Math.log(x) * x ** 0.58
  } else if (region === 'BRAZIL') {
    baseMMR = 14150 - 7.4 * Math.log(x) * x ** 0.57
  } else {
    baseMMR = 14000 - 7.0 * Math.log(x) * x ** 0.6
  }

  return Math.round(baseMMR)
}
// Cache for profile data with expiration
const profileCache = new Map<
  string,
  { data: { rank_tier: number; leaderboard_rank: number } | null; timestamp: number }
>()

const RANK_CACHE_TTL = 30 * 60 * 1000 // 30 minutes in milliseconds for users with rank
const NO_RANK_CACHE_TTL = 30 * 1000 // 30 seconds in milliseconds for users without rank

export async function getOpenDotaProfile(twitchUsername: string): Promise<{
  rank_tier: number
  leaderboard_rank: number
} | null> {
  // Check if we have a valid cached result
  const cacheKey = twitchUsername.toLowerCase()
  const cachedResult = profileCache.get(cacheKey)
  const now = Date.now()

  if (cachedResult) {
    const hasRank =
      cachedResult.data &&
      (cachedResult.data.rank_tier > 0 || cachedResult.data.leaderboard_rank > 0)
    const ttl = hasRank ? RANK_CACHE_TTL : NO_RANK_CACHE_TTL

    if (now - cachedResult.timestamp < ttl) {
      return cachedResult.data
    }
  }

  try {
    // Get user by Twitch username
    const { data: userData } = await supabase
      .from('users')
      .select('id, steam32Id')
      .ilike('name', twitchUsername)
      .single()

    if (!userData) {
      // Cache null results for a short time
      profileCache.set(cacheKey, { data: null, timestamp: now })
      return null
    }

    let steamAccount: { leaderboard_rank: number | null; mmr: number } | null = null

    if (userData.steam32Id) {
      // If steam32Id exists directly on the user, use it
      const { data: account } = await supabase
        .from('steam_accounts')
        .select('leaderboard_rank, mmr')
        .eq('steam32Id', userData.steam32Id)
        .single()

      steamAccount = account
    } else if (userData.id) {
      // If no steam32Id on user, find their steam accounts through userId
      const { data: accounts } = await supabase
        .from('steam_accounts')
        .select('leaderboard_rank, mmr')
        .eq('userId', userData.id)
        .order('mmr', { ascending: false })
        .limit(1)

      // Get the account with the highest MMR
      steamAccount = accounts?.[0] || null
    }

    if (!steamAccount) {
      // Cache null results for a short time
      profileCache.set(cacheKey, { data: null, timestamp: now })
      return null
    }

    // Return rank information
    const result = {
      rank_tier: mmrToRankTier(steamAccount.mmr),
      leaderboard_rank: steamAccount.leaderboard_rank ?? 0,
    }

    // Cache the result (longer for users with rank, shorter for those without)
    profileCache.set(cacheKey, { data: result, timestamp: now })
    return result
  } catch (error) {
    logger.error('Error fetching OpenDota profile:', error)
    // Cache errors for a short time to prevent hammering the API
    profileCache.set(cacheKey, { data: null, timestamp: now })
    return null
  }
}
