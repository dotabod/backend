import { describe, expect, it } from 'vite-plus/test'
import { VisionResolver } from '../../resolvers/VisionResolver'

const ctx = (matchId: string | undefined) => ({ gsi: undefined, matchId })

describe('VisionResolver', () => {
  it('defers when matchId is undefined', async () => {
    let calls = 0
    const r = new VisionResolver(async () => {
      calls++
      return null
    })
    expect(await r.resolve(ctx(undefined))).toBeNull()
    expect(calls).toBe(0)
  })

  it('defers when fetcher returns null', async () => {
    const r = new VisionResolver(async () => null)
    expect(await r.resolve(ctx('12345'))).toBeNull()
  })

  it('self-tags as vision-heroes when payload has heroes', async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: Array.from({ length: 10 }, (_, i) => ({
        hero_id: i + 1,
        hero_name: `h${i}`,
        hero_localized_name: `Hero ${i}`,
        match_score: 0,
        position: i,
        team: i < 5 ? 'radiant' : 'dire',
        variant: '',
      })),
    }))
    const out = await r.resolve(ctx('12345'))
    expect(out?.source).toBe('vision-heroes')
    expect(out?.matchPlayers.length).toBe(10)
  })

  it('self-tags as vision-draft when payload has only draft_player_order', async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: [],
      heroes_status: 'waiting',
      draft_player_order: ['A', 'B', 'C', 'D', 'E'],
    }))
    const out = await r.resolve(ctx('12345'))
    expect(out?.source).toBe('vision-draft')
    expect(out?.heroesStatus).toBe('waiting')
    expect(out?.matchPlayers.length).toBe(5)
  })

  it("preserves heroes_status: 'failed' for vision-draft", async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: [],
      heroes_status: 'failed',
      draft_player_order: ['A', 'B'],
    }))
    const out = await r.resolve(ctx('12345'))
    expect(out?.heroesStatus).toBe('failed')
  })

  it('passes heroes_status through on the vision-heroes path (pick-screen roster)', async () => {
    // Pick-screen fallback payload: sentinel hero_ids, real names/ranks, heroes waiting.
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: Array.from({ length: 10 }, (_, i) => ({
        hero_id: 0,
        hero_name: '',
        hero_localized_name: '',
        match_score: 0,
        position: i % 5,
        player_name: `p${i}`,
        team: i < 5 ? 'radiant' : 'dire',
        variant: '',
      })),
      heroes_status: 'waiting',
    }))
    const out = await r.resolve(ctx('12345'))
    expect(out?.source).toBe('vision-heroes')
    expect(out?.heroesStatus).toBe('waiting')
  })

  it('leaves heroesStatus undefined for a normal vision-heroes roster', async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: Array.from({ length: 10 }, (_, i) => ({
        hero_id: i + 1,
        hero_name: `h${i}`,
        hero_localized_name: `Hero ${i}`,
        match_score: 0,
        position: i,
        team: i < 5 ? 'radiant' : 'dire',
        variant: '',
      })),
    }))
    const out = await r.resolve(ctx('12345'))
    expect(out?.heroesStatus).toBeUndefined()
  })

  it('defers when neither heroes nor draft names are present', async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: [],
      draft_player_order: [],
    }))
    expect(await r.resolve(ctx('12345'))).toBeNull()
  })

  describe('GSI self-hero correction', () => {
    // Scores mirror the real miss on match 8916275620: one slot far weaker than the rest.
    const roster = (ids: number[], scores: number[]) =>
      ids.map((id, i) => ({
        hero_id: id,
        hero_name: `h${id}`,
        hero_localized_name: `Hero ${id}`,
        match_score: scores[i],
        position: i % 5,
        team: i < 5 ? 'Radiant' : 'Dire',
        variant: '',
      }))

    const gsiWithHero = (heroId: number) => ({
      gsi: { hero: { id: heroId }, player: { name: 'streamer', accountid: '1', id: 5 } } as never,
      matchId: '12345',
    })

    it("rewrites the weakest slot when the roster is missing the streamer's hero", async () => {
      // Slot 5 (0.416) is the weakest — the misread one. GSI says the streamer is on hero 111.
      const r = new VisionResolver(async () => ({
        match_id: '12345',
        heroes: roster(
          [33, 57, 3, 6, 13, 39, 100, 38, 138, 11],
          [0.81, 0.78, 0.59, 0.69, 0.63, 0.416, 0.77, 0.55, 0.56, 0.68],
        ),
      }))
      const out = await r.resolve(gsiWithHero(111))
      expect(out?.matchPlayers.map((p) => p.heroid)).toEqual([
        33, 57, 3, 6, 13, 111, 100, 38, 138, 11,
      ])
    })

    it('leaves the roster untouched when it already contains the GSI hero', async () => {
      const ids = [33, 57, 3, 6, 13, 39, 100, 38, 138, 11]
      const r = new VisionResolver(async () => ({
        match_id: '12345',
        heroes: roster(ids, [0.81, 0.78, 0.59, 0.69, 0.63, 0.416, 0.77, 0.55, 0.56, 0.68]),
      }))
      const out = await r.resolve(gsiWithHero(39))
      expect(out?.matchPlayers.map((p) => p.heroid)).toEqual(ids)
    })

    it('leaves the roster untouched when GSI has no hero yet', async () => {
      const ids = [33, 57, 3, 6, 13, 39, 100, 38, 138, 11]
      const r = new VisionResolver(async () => ({
        match_id: '12345',
        heroes: roster(ids, [0.81, 0.78, 0.59, 0.69, 0.63, 0.416, 0.77, 0.55, 0.56, 0.68]),
      }))
      // hero.id === -1 is GSI's "no hero selected" sentinel.
      const out = await r.resolve({ gsi: { hero: { id: -1 } } as never, matchId: '12345' })
      expect(out?.matchPlayers.map((p) => p.heroid)).toEqual(ids)
    })

    it('attaches the streamer identity to the corrected slot', async () => {
      const r = new VisionResolver(async () => ({
        match_id: '12345',
        heroes: roster(
          [33, 57, 3, 6, 13, 39, 100, 38, 138, 11],
          [0.81, 0.78, 0.59, 0.69, 0.63, 0.416, 0.77, 0.55, 0.56, 0.68],
        ),
      }))
      const out = await r.resolve(gsiWithHero(111))
      const self = out?.matchPlayers.find((p) => p.heroid === 111)
      expect(self?.player_name).toBe('streamer')
      expect(self?.accountid).toBe(1)
    })
  })
})
