import type { HeroesStatus, Players } from '../../../../types'
import { type RawRoster, type ResolverContext, RosterResolver } from './RosterResolver'

// Vision-API response shape (subset we actually read).
interface VisionApiHero {
  hero_id: number
  hero_name: string
  hero_localized_name: string
  match_score: number
  position: number
  player_name?: string
  rank?: number
  team: string
  variant: string
  player_id?: number
}
interface VisionApiResponse {
  match_id: string
  heroes: VisionApiHero[]
  heroes_status?: HeroesStatus
  draft_player_order?: (string | null)[]
}

// Fetcher injected for testability — tests pass a stub directly (no `globalThis.fetch` clobbering
// required). Returns null on any error / non-OK response.
export type VisionFetcher = (matchId: string) => Promise<VisionApiResponse | null>

// Default fetcher: hits `${VISION_API_HOST}/match/${matchId}` with the API key from env.
const defaultVisionFetcher: VisionFetcher = async (matchId) => {
  const host = process.env.VISION_API_HOST
  if (!host) return null
  try {
    const res = await fetch(`https://${host}/match/${matchId}`, {
      headers: { 'X-API-Key': process.env.VISION_API_KEY || '' },
    })
    if (!res.ok) return null
    return (await res.json()) as VisionApiResponse
  } catch {
    return null
  }
}

// Handles both vision-derived sources:
//   - `vision-heroes` when the API returned a non-empty `heroes[]`
//   - `vision-draft`  when only `draft_player_order` is present (heroes_status: 'waiting' | 'failed')
// One fetch covers both — `source` is decided by the payload, not by the caller.
export class VisionResolver extends RosterResolver {
  readonly name = 'vision' as const
  constructor(private readonly fetcher: VisionFetcher = defaultVisionFetcher) {
    super()
  }

  async resolve({ matchId, gsi }: ResolverContext): Promise<RawRoster | null> {
    if (!matchId) return null
    const data = await this.fetcher(matchId)
    if (!data) return null

    if (Array.isArray(data.heroes) && data.heroes.length > 0) {
      const matchPlayers: Players = data.heroes.map((hero) => ({
        heroid: hero.hero_id,
        rank: hero.rank,
        player_name: hero.hero_id === gsi?.hero?.id ? gsi?.player?.name : hero.player_name,
        accountid: hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.accountid) : 0,
        playerid: hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.id) : hero.player_id || null,
      }))
      return { source: 'vision-heroes', matchPlayers }
    }

    const draftNames = (data.draft_player_order ?? []).filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    )
    if (draftNames.length === 0) return null

    const matchPlayers: Players = draftNames.map((name) => ({
      heroid: undefined,
      accountid: 0,
      playerid: null,
      player_name: name,
    }))
    return {
      source: 'vision-draft',
      matchPlayers,
      heroesStatus: data.heroes_status ?? 'waiting',
    }
  }
}
