import { steamID32toSteamID64, steamID64toSteamID32 } from '../utils/index'

export interface SteamPlayerSummary {
  personaName: string | null
  countryCode: string | null
}

const SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000
const summaryCache = new Map<number, { summary: SteamPlayerSummary | null; expiresAt: number }>()

export async function getSteamPlayerSummaries(
  accountIds: number[],
): Promise<Map<number, SteamPlayerSummary>> {
  const uniqueAccountIds = [...new Set(accountIds.filter((id) => Number.isFinite(id) && id > 0))]
  const apiKey = process.env.STEAM_WEB_API
  if (!apiKey || uniqueAccountIds.length === 0) return new Map()

  const now = Date.now()
  const summaries = new Map<number, SteamPlayerSummary>()
  const uncachedAccountIds = uniqueAccountIds.filter((accountId) => {
    const cached = summaryCache.get(accountId)
    if (!cached || cached.expiresAt <= now) {
      summaryCache.delete(accountId)
      return true
    }
    if (cached.summary) summaries.set(accountId, cached.summary)
    return false
  })
  if (uncachedAccountIds.length === 0) return summaries

  const steamIds = uncachedAccountIds
    .map((accountId) => steamID32toSteamID64(accountId))
    .filter((steamId): steamId is string => steamId !== null)
  if (steamIds.length === 0) return new Map()

  try {
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('steamids', steamIds.join(','))
    const response = await fetch(url)
    if (!response.ok) return summaries

    const body = (await response.json()) as {
      response?: {
        players?: Array<{
          steamid?: string
          personaname?: string
          loccountrycode?: string
        }>
      }
    }
    const returnedAccountIds = new Set<number>()
    for (const player of body.response?.players ?? []) {
      if (!player.steamid) continue
      const accountId = steamID64toSteamID32(player.steamid)
      if (accountId === null || !uncachedAccountIds.includes(accountId)) continue
      const summary = {
        personaName: player.personaname?.trim() || null,
        countryCode: player.loccountrycode?.trim().toUpperCase() || null,
      }
      summaries.set(accountId, summary)
      summaryCache.set(accountId, { summary, expiresAt: now + SUMMARY_CACHE_TTL_MS })
      returnedAccountIds.add(accountId)
    }
    for (const accountId of uncachedAccountIds) {
      if (!returnedAccountIds.has(accountId)) {
        summaryCache.set(accountId, { summary: null, expiresAt: now + SUMMARY_CACHE_TTL_MS })
      }
    }
    return summaries
  } catch {
    return summaries
  }
}
