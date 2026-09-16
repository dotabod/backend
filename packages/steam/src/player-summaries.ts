import { z } from 'zod'

import { logger as defaultLogger } from './utils/logger'

const STEAM_ID64_BASE = 76_561_197_960_265_728n
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 5000
const CACHE_STATS_INTERVAL_MS = 10 * 60 * 1000

export interface SteamPlayerSummary {
  account_id: number
  persona_name: string | null
  country_code: string | null
}

interface Persona {
  player_name?: string
}

interface PersonaClient {
  getPersonas: (steamIds: string[]) => Promise<{ personas: Record<string, Persona> }>
}

interface SteamPlayerSummaryServiceOptions {
  getPersonas: PersonaClient['getPersonas']
  apiKey?: string
  fetchImpl?: typeof fetch
  logger?: CacheLogger
  now?: () => number
}

interface CacheEntry {
  expiresAt: number
  summary: SteamPlayerSummary
}

interface WebSummary {
  countryCode: string | null
  personaName: string | null
}

interface CacheStats {
  capacityEvictions: number
  expiredEvictions: number
  hits: number
  misses: number
}

interface CacheStatsMetadata extends CacheStats {
  cacheSize: number
  maxEntries: number
  // Counters are cumulative over this window, and the window only advances when `get` is
  // called, so it stretches during idle periods. Without it the numbers are not rates.
  windowMs: number
}

interface CacheLogger {
  info: (message: string, metadata: CacheStatsMetadata) => void
}

const webJsonValueSchema = z.json()
const webPlayerSchema = z.object({
  loccountrycode: webJsonValueSchema.optional(),
  personaname: webJsonValueSchema.optional(),
  steamid: webJsonValueSchema.optional(),
})
const webSummaryResponseSchema = z.object({
  response: z
    .object({
      players: z.array(webJsonValueSchema).optional(),
    })
    .optional(),
})

type WebPlayerField = z.infer<typeof webJsonValueSchema> | undefined

const webText = function webText(value: WebPlayerField): string | undefined {
  const parsedText = z.string().safeParse(value)
  return parsedText.success ? parsedText.data : undefined
}

const trimmedTextOrNull = function trimmedTextOrNull(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

const toSteamId64 = (accountId: number): string => (STEAM_ID64_BASE + BigInt(accountId)).toString()

const toAccountId = (steamId64: string): number => Number(BigInt(steamId64) - STEAM_ID64_BASE)

const validAccountId = function validAccountId(steamId64?: string): number | null {
  if (steamId64 === undefined || steamId64.length === 0) {
    return null
  }
  const accountId = toAccountId(steamId64)
  return Number.isInteger(accountId) && accountId > 0 ? accountId : null
}

export class SteamPlayerSummaryService {
  private readonly cache = new Map<number, CacheEntry>()
  private readonly cacheLogger: CacheLogger
  private readonly cacheStats: CacheStats = {
    capacityEvictions: 0,
    expiredEvictions: 0,
    hits: 0,
    misses: 0,
  }
  private readonly getPersonas: PersonaClient['getPersonas']
  private readonly apiKey?: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private lastStatsLoggedAt: number

  constructor({
    getPersonas,
    apiKey,
    fetchImpl = fetch,
    logger = defaultLogger,
    now = Date.now,
  }: SteamPlayerSummaryServiceOptions) {
    this.getPersonas = getPersonas
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl
    this.cacheLogger = logger
    this.now = now
    this.lastStatsLoggedAt = now()
  }

  async get(accountIds: number[]): Promise<SteamPlayerSummary[]> {
    const uniqueIds = [
      ...new Set(accountIds.filter((id) => Number.isInteger(id) && id > 0 && id <= 0xff_ff_ff_ff)),
    ]
    const now = this.now()
    this.removeExpired(now)
    const results = new Map<number, SteamPlayerSummary>()
    const uncached = uniqueIds.filter((accountId) => {
      const cached = this.cache.get(accountId)
      if (!cached) {
        this.cacheStats.misses += 1
        return true
      }
      this.cacheStats.hits += 1
      results.set(accountId, cached.summary)
      return false
    })

    if (uncached.length > 0) {
      const steamIds = uncached.map(toSteamId64)
      const [personaResult, webResult] = await Promise.allSettled([
        this.getPersonas(steamIds),
        this.fetchWebSummaries(steamIds),
      ])
      const personas = personaResult.status === 'fulfilled' ? personaResult.value.personas : {}
      const webSummaries =
        webResult.status === 'fulfilled' ? webResult.value : new Map<number, WebSummary>()
      const expiresAt = this.now() + CACHE_TTL_MS

      for (const accountId of uncached) {
        const steamId = toSteamId64(accountId)
        const web = webSummaries.get(accountId)
        const personaName =
          trimmedTextOrNull(personas[steamId]?.player_name) ?? web?.personaName ?? null
        const summary = {
          account_id: accountId,
          country_code: web?.countryCode ?? null,
          persona_name: personaName,
        }
        results.set(accountId, summary)
        // A concurrent request may have filled this key while the Steam calls were pending.
        // Reinsert it so Map order continues to match expiry order for oldest-first cleanup.
        this.cache.delete(accountId)
        this.cache.set(accountId, { expiresAt, summary })
      }
      this.enforceCapacity()
    }

    const summaries = uniqueIds.flatMap((accountId) => {
      const summary = results.get(accountId)
      return summary ? [summary] : []
    })
    this.logCacheStatsIfDue(this.now())
    return summaries
  }

  private enforceCapacity(): void {
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldestAccountId = this.cache.keys().next().value
      if (oldestAccountId === undefined) {
        return
      }
      this.cache.delete(oldestAccountId)
      this.cacheStats.capacityEvictions += 1
    }
  }

  private logCacheStatsIfDue(now: number): void {
    if (now - this.lastStatsLoggedAt < CACHE_STATS_INTERVAL_MS) {
      return
    }
    this.cacheLogger.info('[STEAM] Player summary cache stats', {
      ...this.cacheStats,
      cacheSize: this.cache.size,
      maxEntries: CACHE_MAX_ENTRIES,
      windowMs: now - this.lastStatsLoggedAt,
    })
    this.cacheStats.capacityEvictions = 0
    this.cacheStats.expiredEvictions = 0
    this.cacheStats.hits = 0
    this.cacheStats.misses = 0
    this.lastStatsLoggedAt = now
  }

  private removeExpired(now: number): void {
    for (const [accountId, entry] of this.cache) {
      if (entry.expiresAt > now) {
        return
      }
      this.cache.delete(accountId)
      this.cacheStats.expiredEvictions += 1
    }
  }

  private async fetchWebSummaries(steamIds: string[]): Promise<Map<number, WebSummary>> {
    if (this.apiKey === undefined || this.apiKey.length === 0 || steamIds.length === 0) {
      return new Map()
    }

    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
    url.searchParams.set('key', this.apiKey)
    url.searchParams.set('steamids', steamIds.join(','))
    const response = await this.fetchImpl(url)
    if (!response.ok) {
      return new Map()
    }

    const parsedBody = webSummaryResponseSchema.safeParse(await response.json())
    if (!parsedBody.success) {
      return new Map()
    }

    const summaries = new Map<number, WebSummary>()
    for (const playerValue of parsedBody.data.response?.players ?? []) {
      const parsedPlayer = webPlayerSchema.safeParse(playerValue)
      const accountId = parsedPlayer.success
        ? validAccountId(webText(parsedPlayer.data.steamid))
        : null
      if (accountId !== null && parsedPlayer.success) {
        summaries.set(accountId, {
          countryCode:
            trimmedTextOrNull(webText(parsedPlayer.data.loccountrycode))?.toUpperCase() ?? null,
          personaName: trimmedTextOrNull(webText(parsedPlayer.data.personaname)),
        })
      }
    }
    return summaries
  }
}
