import RedisClient from '../db/RedisClient.js'
import type { SocketClient } from '../types.js'

export function steamID64toSteamID32(steamID64: string) {
  if (!steamID64) return null
  return Number(steamID64.substr(-16, 16)) - 6561197960265728
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

  // If not ranked, or mmr is 8500 or less or not set, return false
  if (
    !currentSteamAccount?.leaderboard_rank ||
    (dotaClient.mmr && dotaClient.mmr <= 8500) ||
    !dotaClient.mmr
  ) {
    return false
  }

  // Treating anyone with a leaderboard rank as 8500+
  // The lowest rank is 5000
  return true
}
