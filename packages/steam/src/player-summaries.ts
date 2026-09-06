import { z } from 'zod'

const STEAM_ID64_BASE = 76_561_197_960_265_728n
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
  getPersonas: (steamIds: string[]) => Promise<{ personas: Record<string, Persona> }>
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

interface WebSummary {
  countryCode: string | null
  personaName: string | null
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
      ...new Set(accountIds.filter((id) => Number.isInteger(id) && id > 0 && id <= 0xff_ff_ff_ff)),
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

    if (uncached.length > 0) {
      const steamIds = uncached.map(toSteamId64)
      const [personaResult, webResult] = await Promise.allSettled([
        this.getPersonas(steamIds),
        this.fetchWebSummaries(steamIds),
      ])
      const personas = personaResult.status === 'fulfilled' ? personaResult.value.personas : {}
      const webSummaries =
        webResult.status === 'fulfilled' ? webResult.value : new Map<number, WebSummary>()

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
        this.cache.set(accountId, { expiresAt: now + CACHE_TTL_MS, summary })
      }
    }

    return uniqueIds.flatMap((accountId) => {
      const summary = results.get(accountId)
      return summary ? [summary] : []
    })
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
