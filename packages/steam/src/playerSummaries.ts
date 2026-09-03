const STEAM_ID64_BASE = 76561197960265728n
const CACHE_TTL_MS = 10 * 60 * 1000

export interface SteamPlayerSummary {
  account_id: number
  persona_name: string | null
  country_code: string | null
}

interface Persona {
  player_name?: string
}

interface PersonaClient {
  getPersonas(steamIds: string[]): Promise<{ personas: Record<string, Persona> }>
}

interface SteamPlayerSummaryServiceOptions {
  getPersonas: PersonaClient['getPersonas']
  apiKey?: string
  fetchImpl?: typeof fetch
}

interface CacheEntry {
  expiresAt: number
  summary: SteamPlayerSummary
}

const toSteamId64 = (accountId: number): string => (STEAM_ID64_BASE + BigInt(accountId)).toString()

const toAccountId = (steamId64: string): number => Number(BigInt(steamId64) - STEAM_ID64_BASE)

export class SteamPlayerSummaryService {
  private readonly cache = new Map<number, CacheEntry>()
  private readonly getPersonas: PersonaClient['getPersonas']
  private readonly apiKey?: string
  private readonly fetchImpl: typeof fetch

  constructor({ getPersonas, apiKey, fetchImpl = fetch }: SteamPlayerSummaryServiceOptions) {
    this.getPersonas = getPersonas
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl
  }

  async get(accountIds: number[]): Promise<SteamPlayerSummary[]> {
    const uniqueIds = [
      ...new Set(accountIds.filter((id) => Number.isInteger(id) && id > 0 && id <= 0xffffffff)),
    ]
    const now = Date.now()
    const results = new Map<number, SteamPlayerSummary>()
    const uncached = uniqueIds.filter((accountId) => {
      const cached = this.cache.get(accountId)
      if (!cached || cached.expiresAt <= now) {
        this.cache.delete(accountId)
        return true
      }
      results.set(accountId, cached.summary)
      return false
    })

    if (uncached.length) {
      const steamIds = uncached.map(toSteamId64)
      const [personaResult, webResult] = await Promise.allSettled([
        this.getPersonas(steamIds),
        this.fetchWebSummaries(steamIds),
      ])
      const personas = personaResult.status === 'fulfilled' ? personaResult.value.personas : {}
      const webSummaries = webResult.status === 'fulfilled' ? webResult.value : new Map()

      for (const accountId of uncached) {
        const steamId = toSteamId64(accountId)
        const web = webSummaries.get(accountId)
        const summary = {
          account_id: accountId,
          persona_name: personas?.[steamId]?.player_name?.trim() || web?.personaName || null,
          country_code: web?.countryCode || null,
        }
        results.set(accountId, summary)
        this.cache.set(accountId, { summary, expiresAt: now + CACHE_TTL_MS })
      }
    }

    return uniqueIds.flatMap((accountId) => {
      const summary = results.get(accountId)
      return summary ? [summary] : []
    })
  }

  private async fetchWebSummaries(
    steamIds: string[],
  ): Promise<Map<number, { personaName: string | null; countryCode: string | null }>> {
    if (!this.apiKey || !steamIds.length) return new Map()

    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
    url.searchParams.set('key', this.apiKey)
    url.searchParams.set('steamids', steamIds.join(','))
    const response = await this.fetchImpl(url)
    if (!response.ok) return new Map()

    const body = (await response.json()) as {
      response?: {
        players?: Array<{
          steamid?: string
          personaname?: string
          loccountrycode?: string
        }>
      }
    }
    const summaries = new Map<number, { personaName: string | null; countryCode: string | null }>()
    for (const player of body.response?.players ?? []) {
      if (!player.steamid) continue
      const accountId = toAccountId(player.steamid)
      if (!Number.isInteger(accountId) || accountId <= 0) continue
      summaries.set(accountId, {
        personaName: player.personaname?.trim() || null,
        countryCode: player.loccountrycode?.trim().toUpperCase() || null,
      })
    }
    return summaries
  }
}
