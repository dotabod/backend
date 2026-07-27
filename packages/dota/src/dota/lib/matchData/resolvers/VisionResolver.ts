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

// The streamer's own hero is known for certain from GSI, so if the OCR roster doesn't contain
// it, exactly one slot was misread. Rather than publish a confident wrong hero, rewrite the
// least-confident slot to the GSI hero — that slot is overwhelmingly the culprit, because the
// portrait the detector had to read is the one partly covered by the streamer's own HUD.
//
// Measured over 460 in-game slots (2 days of production): the roster contained the GSI hero in
// 45/46 rosters. In the one miss (match 8916275620) Topson's Oracle was published as Queen of
// Pain, and that slot scored 0.416 — the lowest of all 460. A plain score threshold can't fix
// this: a *correct* slot elsewhere scored 0.386, so any cutoff that kills the bad read also
// kills good ones. Anchoring on GSI is exact where a threshold is a guess.
function correctSelfHeroWithGsi(heroes: VisionApiHero[], selfHeroId: number | undefined) {
  if (!selfHeroId || selfHeroId <= 0) return heroes
  if (heroes.some((h) => h.hero_id === selfHeroId)) return heroes

  let weakest = 0
  for (let i = 1; i < heroes.length; i++) {
    if ((heroes[i].match_score ?? 1) < (heroes[weakest].match_score ?? 1)) weakest = i
  }
  return heroes.map((h, i) => (i === weakest ? { ...h, hero_id: selfHeroId } : h))
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
      const heroes = correctSelfHeroWithGsi(data.heroes, gsi?.hero?.id)
      const matchPlayers: Players = heroes.map((hero) => ({
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
