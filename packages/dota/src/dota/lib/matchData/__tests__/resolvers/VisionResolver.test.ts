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

  it('defers when neither heroes nor draft names are present', async () => {
    const r = new VisionResolver(async () => ({
      match_id: '12345',
      heroes: [],
      draft_player_order: [],
    }))
    expect(await r.resolve(ctx('12345'))).toBeNull()
  })
})
