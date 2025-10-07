import RedisClient from '../db/RedisClient.js'
import type { SocketClient } from '../types.js'

const STEAMID64_OFFSET = 76561197960265728n

export function steamID64toSteamID32(steamID64: string) {
  if (!steamID64) return null
  try {
    return Number(BigInt(steamID64) - STEAMID64_OFFSET)
  } catch (error) {
    return null
  }
}

export function steamID32toSteamID64(steam32Id: number) {
  try {
    return (BigInt(steam32Id) + STEAMID64_OFFSET).toString()
  } catch (error) {
    return null
  }
}

export function fmtMSS(totalSeconds: number) {
  // 👇️ get number of full minutes
  const minutes = Math.floor(totalSeconds / 60)

  // 👇️ get remainder of seconds
  const seconds = totalSeconds % 60

  function padTo2Digits(num: number) {
    return num.toString().padStart(2, '0')
  }

  // ✅ format as MM:SS
  return `${padTo2Digits(minutes)}:${padTo2Digits(seconds)}`
}

const redisClient = RedisClient.getInstance()
export const getRedisNumberValue = async (key: string) => {
  const value = await redisClient.client.get(key)
  return value !== null ? Number(value) : null
}

export const is8500Plus = (dotaClient: SocketClient) => {
  const currentSteamAccount = dotaClient.SteamAccount?.find(
    (account) => dotaClient.steam32Id === account.steam32Id,
  )

  if(dotaClient.mmr && dotaClient.mmr > 8500) {
    return true
  }

  if(currentSteamAccount && currentSteamAccount?.mmr >= 8500) {
    return true
  }

  if(currentSteamAccount?.leaderboard_rank) {
    return true
  }

  // Treating anyone with a leaderboard rank as 8500+
  // The lowest rank is 5000
  return false
}
