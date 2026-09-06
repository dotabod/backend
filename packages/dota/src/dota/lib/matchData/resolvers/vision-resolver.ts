import { z } from 'zod'

import type { Players } from '../../../../types'
import { RosterResolver } from './roster-resolver'
import type { RawRoster, ResolverContext } from './roster-resolver'

const visionApiHeroSchema = z.object({
  hero_id: z.number(),
  hero_localized_name: z.string(),
  hero_name: z.string(),
  match_score: z.number(),
  player_id: z.number().optional(),
  player_name: z.string().optional(),
  position: z.number(),
  rank: z.number().optional(),
  team: z.string(),
  variant: z.string(),
})
const visionApiResponseSchema = z.object({
  draft_player_order: z.array(z.string().nullable()).optional(),
  heroes: z.array(visionApiHeroSchema),
  heroes_status: z.enum(['waiting', 'failed']).optional(),
  match_id: z.string(),
})

type VisionApiHero = z.infer<typeof visionApiHeroSchema>
type VisionApiResponse = z.infer<typeof visionApiResponseSchema>

// Fetcher injected for testability — tests pass a stub directly (no `globalThis.fetch` clobbering
// required). Returns null on any error / non-OK response.
export type VisionFetcher = (matchId: string) => Promise<VisionApiResponse | null>

// Default fetcher: hits `${VISION_API_HOST}/match/${matchId}` with the API key from env.
const defaultVisionFetcher: VisionFetcher = async (matchId) => {
  const host = process.env.VISION_API_HOST
  if (host === undefined || host.length === 0) {
    return null
  }
  try {
    const res = await fetch(`https://${host}/match/${matchId}`, {
      headers: { 'X-API-Key': process.env.VISION_API_KEY ?? '' },
    })
    if (!res.ok) {
      return null
    }
    const response: unknown = await res.json()
    return visionApiResponseSchema.parse(response)
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
const correctSelfHeroWithGsi = function correctSelfHeroWithGsi(
  heroes: VisionApiHero[],
  selfHeroId: number | undefined
) {
  if (selfHeroId === undefined || selfHeroId <= 0) {
    return heroes
  }
  if (heroes.some((h) => h.hero_id === selfHeroId)) {
    return heroes
  }

  let weakest = 0
  for (let i = 1; i < heroes.length; i += 1) {
    if ((heroes[i].match_score ?? 1) < (heroes[weakest].match_score ?? 1)) {
      weakest = i
    }
  }
  return heroes.map((h, i) => (i === weakest ? { ...h, hero_id: selfHeroId } : h))
}

// Handles both vision-derived sources:
//   - `vision-heroes` when the API returned a non-empty `heroes[]`
//   - `vision-draft`  when only `draft_player_order` is present (heroes_status: 'waiting' | 'failed')
// One fetch covers both — `source` is decided by the payload, not by the caller.
export class VisionResolver extends RosterResolver {
  private readonly fetcher: VisionFetcher
  readonly name = 'vision' as const

  constructor(fetcher: VisionFetcher = defaultVisionFetcher) {
    super()
    this.fetcher = fetcher
  }

  async resolve({ matchId, gsi }: ResolverContext): Promise<RawRoster | null> {
    if (matchId === undefined || matchId.length === 0) {
      return null
    }
    const data = await this.fetcher(matchId)
    if (data === null) {
      return null
    }

    if (Array.isArray(data.heroes) && data.heroes.length > 0) {
      const heroes = correctSelfHeroWithGsi(data.heroes, gsi?.hero?.id)
      const matchPlayers: Players = heroes.map((hero) => ({
        accountid: hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.accountid) : 0,
        heroid: hero.hero_id,
        player_name: hero.hero_id === gsi?.hero?.id ? gsi?.player?.name : hero.player_name,
        playerid:
          hero.hero_id === gsi?.hero?.id ? Number(gsi?.player?.id) : (hero.player_id ?? null),
        rank: hero.rank,
      }))
      // Pass heroes_status through so a pick-screen roster (sentinel hero_ids, real names/ranks)
      // can render without a (?) suffix while hero identity is still unknown.
      const roster: RawRoster = { matchPlayers, source: 'vision-heroes' }
      if (data.heroes_status !== undefined) {
        roster.heroesStatus = data.heroes_status
      }
      return roster
    }

    const draftNames = (data.draft_player_order ?? []).filter(
      (name): name is string => name !== null && name.trim().length > 0
    )
    if (draftNames.length === 0) {
      return null
    }

    const matchPlayers: Players = draftNames.map((name) => ({
      accountid: 0,
      heroid: 0,
      player_name: name,
      playerid: null,
    }))
    return {
      heroesStatus: data.heroes_status ?? 'waiting',
      matchPlayers,
      source: 'vision-draft',
    }
  }
}
