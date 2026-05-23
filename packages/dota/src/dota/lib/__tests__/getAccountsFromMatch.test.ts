import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ supabase: {}, logger: noopLogger }))

// No delayedGames doc → the function falls through to the Vision API path.
vi.doMock('../../../steam/MongoDBSingleton', () => ({
  default: {
    connect: async () => ({
      collection: () => ({ findOne: async () => null }),
    }),
    close: async () => undefined,
  },
}))

// Import via a query suffix so bun re-evaluates the real module instead of
// returning a stub. Other harnesses (gsiMocks, lastgame) register process-wide
// `vi.doMock('.../getAccountsFromMatch', …)` stubs that would otherwise win
// the global registry race and replace the very function this file tests.
const realModuleSpecifier = '../getAccountsFromMatch.ts?real'
const realModule = (await import(
  realModuleSpecifier
)) as typeof import('../getAccountsFromMatch.ts')
const { getAccountsFromMatch } = realModule

const realFetch = globalThis.fetch

function mockVision(payload: unknown, ok = true) {
  globalThis.fetch = (async () => ({
    ok,
    json: async () => payload,
  })) as unknown as typeof fetch
}

describe('getAccountsFromMatch — draft-only Vision responses', () => {
  const origHost = process.env.VISION_API_HOST
  const origKey = process.env.VISION_API_KEY

  beforeEach(() => {
    process.env.VISION_API_HOST = 'vision.test'
    process.env.VISION_API_KEY = 'key'
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    // Restore env so this suite doesn't leak VISION_API_HOST into sibling tests.
    if (origHost === undefined) delete process.env.VISION_API_HOST
    else process.env.VISION_API_HOST = origHost
    if (origKey === undefined) delete process.env.VISION_API_KEY
    else process.env.VISION_API_KEY = origKey
  })

  it('maps draft_player_order to players when heroes are empty', async () => {
    mockVision({
      match_id: '123',
      heroes: [],
      is_draft: true,
      heroes_status: 'waiting',
      draft_player_order: ['RadCap', 'DireCap', 'P1', null, 'P2', '', '  ', 'P3'],
    })

    const { matchPlayers, accountIds, heroesStatus } = await getAccountsFromMatch({
      searchMatchId: '123',
    })

    expect(heroesStatus).toBe('waiting')
    expect(accountIds).toEqual([])
    // Nulls and blank strings are dropped.
    expect(matchPlayers.map((p) => p.player_name)).toEqual(['RadCap', 'DireCap', 'P1', 'P2', 'P3'])
    for (const p of matchPlayers) {
      expect(p.heroid).toBeUndefined()
      expect(p.accountid).toBe(0)
      expect(p.playerid).toBeNull()
    }
  })

  it('passes through heroes_status=failed', async () => {
    mockVision({
      match_id: '123',
      heroes: [],
      heroes_status: 'failed',
      draft_player_order: ['A', 'B'],
    })

    const { matchPlayers, heroesStatus } = await getAccountsFromMatch({ searchMatchId: '123' })

    expect(heroesStatus).toBe('failed')
    expect(matchPlayers).toHaveLength(2)
  })

  it('defaults heroesStatus to waiting when the field is absent', async () => {
    mockVision({ match_id: '123', heroes: [], draft_player_order: ['A'] })

    const { heroesStatus } = await getAccountsFromMatch({ searchMatchId: '123' })

    expect(heroesStatus).toBe('waiting')
  })

  it('returns empty (no heroesStatus) when heroes and draft names are both absent', async () => {
    mockVision({ match_id: '123', heroes: [], players: [] })

    const result = await getAccountsFromMatch({ searchMatchId: '123' })

    expect(result.matchPlayers).toEqual([])
    expect(result.accountIds).toEqual([])
    expect(result.heroesStatus).toBeUndefined()
  })

  it('uses the hero-based mapping (no heroesStatus) when heroes are present', async () => {
    mockVision({
      match_id: '123',
      heroes: [
        { hero_id: 1, hero_name: 'antimage', position: 0, team: 'radiant', player_name: 'Bob' },
      ],
      players: [],
    })

    const { matchPlayers, heroesStatus } = await getAccountsFromMatch({ searchMatchId: '123' })

    expect(heroesStatus).toBeUndefined()
    expect(matchPlayers).toHaveLength(1)
    expect(matchPlayers[0].heroid).toBe(1)
    expect(matchPlayers[0].player_name).toBe('Bob')
  })
})
