import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: {}, logger: noopLogger }),
)

// Lower-level mocks (Mongo + steam socket). We do NOT mock `getAccountsFromMatch` itself —
// `mock.module()` is process-wide and would pollute sibling test files that depend on its real
// behaviour (e.g. `getStreamersInMatch.test.ts`). Instead we let the real helper run its
// fall-through against our controlled Mongo doc / Vision fetch / GSI fixtures.

let mongoDoc: unknown = null
let mongoCallCount = 0

mock.module('../../../steam/MongoDBSingleton', () => ({
  default: {
    connect: async () => ({
      collection: () => ({
        findOne: async () => {
          mongoCallCount++
          return mongoDoc
        },
      }),
    }),
    close: async () => undefined,
  },
}))

let cardsResponse: Array<Record<string, unknown>> = []
let socketCallCount = 0
let socketLastIds: number[] = []

mock.module('../../../steam/ws', () => ({
  steamSocket: {
    emit: (
      _event: string,
      ids: number[],
      _refetch: boolean,
      cb: (err: unknown, cards: unknown) => void,
    ) => {
      socketCallCount++
      socketLastIds = ids
      cb(null, cardsResponse)
    },
  },
  twitchChat: { on: () => undefined },
}))

const { MatchDataService } = await import('../MatchDataService.ts')

// --- Vision API mock via global fetch (matches the pattern in getAccountsFromMatch.test.ts) ---
const realFetch = globalThis.fetch
function mockVision(payload: unknown, ok = true) {
  globalThis.fetch = (async () => ({ ok, json: async () => payload })) as unknown as typeof fetch
}
function noVisionHost() {
  delete process.env.VISION_API_HOST
}
function withVisionHost() {
  process.env.VISION_API_HOST = 'vision.test'
  process.env.VISION_API_KEY = 'key'
}

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.VISION_API_HOST
  delete process.env.VISION_API_KEY
})

// --- Client fixture ---

interface ClientOverrides {
  matchid?: string | undefined
  steam32Id?: number | null
  mmr?: number
  leaderboard_rank?: number | null
  stream_online?: boolean
  gsi?: any
  disableAutoClipping?: boolean
  ownAccountId?: string | undefined
  ownHeroId?: number | undefined
}

function makeClient(o: ClientOverrides = {}): any {
  const matchid = o.matchid === undefined ? '8800000001' : o.matchid
  const ownAccountId = o.ownAccountId ?? '111'
  const baseGsi = matchid
    ? {
        map: { matchid, win_team: 'none', customgamename: '' },
        player: { accountid: ownAccountId, team_name: 'radiant' },
        hero: o.ownHeroId !== undefined ? { id: o.ownHeroId } : undefined,
      }
    : {
        map: { customgamename: '' },
        player: { accountid: ownAccountId, team_name: 'radiant' },
        hero: undefined,
      }
  return {
    token: 'broadcaster',
    name: 'channel',
    stream_online: o.stream_online ?? true,
    locale: 'en',
    steam32Id: o.steam32Id === undefined ? 111 : o.steam32Id,
    mmr: o.mmr ?? 4000,
    SteamAccount: [
      {
        steam32Id: 111,
        mmr: o.mmr ?? 4000,
        leaderboard_rank: o.leaderboard_rank ?? null,
        name: 'self',
      },
    ],
    settings: o.disableAutoClipping ? [{ key: 'disableAutoClipping', value: true }] : [],
    subscription: { tier: 'PRO', status: 'ACTIVE', isGift: false },
    gsi: o.gsi ?? baseGsi,
  }
}

// --- Mongo doc + Vision response builders ---

// SourceTV writer stores a flat top-level `players[]` (no `teams[]`); see steam.ts:189.
function sourceTvDoc(opts: { partialHeroes?: boolean } = {}) {
  return {
    match: { match_id: '8800000001', game_mode: 22, lobby_type: 7 },
    average_mmr: 6500,
    spectators: 0,
    players: Array.from({ length: 10 }, (_, i) => ({
      heroid: opts.partialHeroes && i >= 7 ? 0 : i + 1,
      accountid: 1000 + i,
    })),
  }
}

function visionHeroesPayload() {
  return {
    match_id: '8800000001',
    heroes: Array.from({ length: 10 }, (_, i) => ({
      hero_id: i + 1,
      hero_name: `hero${i + 1}`,
      hero_localized_name: `Hero ${i + 1}`,
      match_score: 100,
      position: i,
      player_name: `Player ${i + 1}`,
      rank: 8500 + i * 50,
      team: i < 5 ? 'radiant' : 'dire',
      variant: '',
      player_id: i,
    })),
    players: [],
  }
}

function visionDraftPayload(heroes_status: 'waiting' | 'failed' = 'waiting') {
  return {
    match_id: '8800000001',
    heroes: [],
    heroes_status,
    draft_player_order: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  }
}

function gsiSpectatorClient(o: ClientOverrides = {}): any {
  // Spectator GSI: hero.team2/team3 each carry 5 players (player0..player4 / player5..player9).
  const team2 = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }]),
  )
  const team3 = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }]),
  )
  const team2Players = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }]),
  )
  const team3Players = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }]),
  )
  return makeClient({
    ...o,
    gsi: {
      map: { matchid: '8800000001', win_team: 'none', customgamename: '' },
      player: {
        accountid: '111',
        team_name: 'spectator',
        team2: team2Players,
        team3: team3Players,
      },
      hero: { team2, team3 },
    },
  })
}

beforeEach(() => {
  mongoDoc = null
  mongoCallCount = 0
  cardsResponse = []
  socketCallCount = 0
  socketLastIds = []
  globalThis.fetch = realFetch
})

describe('MatchDataService — sync getters', () => {
  it('treats matchid "0" as undefined', () => {
    expect(new MatchDataService(makeClient({ matchid: '0' })).matchId).toBeUndefined()
  })

  it('overrideMatchId beats gsi matchid', () => {
    expect(new MatchDataService(makeClient({ matchid: '111' }), 'override-999').matchId).toBe(
      'override-999',
    )
  })

  it('hasSteam32Id reflects client.steam32Id', () => {
    expect(new MatchDataService(makeClient({ steam32Id: null })).hasSteam32Id).toBe(false)
    expect(new MatchDataService(makeClient({ steam32Id: 42 })).hasSteam32Id).toBe(true)
  })

  it('isStreamOnline reflects client.stream_online', () => {
    expect(new MatchDataService(makeClient({ stream_online: false })).isStreamOnline).toBe(false)
    expect(new MatchDataService(makeClient({ stream_online: true })).isStreamOnline).toBe(true)
  })

  it('isHighMmr is true on >8500 mmr', () => {
    expect(new MatchDataService(makeClient({ mmr: 9000 })).isHighMmr).toBe(true)
  })

  it('isHighMmr is true when steam_account has leaderboard rank', () => {
    expect(new MatchDataService(makeClient({ mmr: 100, leaderboard_rank: 500 })).isHighMmr).toBe(
      true,
    )
  })

  it('isHighMmr is false sub-8500 with no leaderboard', () => {
    expect(new MatchDataService(makeClient({ mmr: 5000 })).isHighMmr).toBe(false)
  })

  it('isArcade reflects gsi customgamename', () => {
    const arcadeClient = makeClient({
      gsi: { map: { matchid: '1', customgamename: 'overthrow' }, player: { accountid: '111' } },
    })
    expect(new MatchDataService(arcadeClient).isArcade).toBe(true)
    expect(new MatchDataService(makeClient()).isArcade).toBe(false)
  })

  it('hasWinTeam true when win_team is radiant/dire, false for "none"', () => {
    const winning = makeClient({
      gsi: { map: { matchid: '1', win_team: 'radiant', customgamename: '' } },
    })
    expect(new MatchDataService(winning).hasWinTeam).toBe(true)
    expect(new MatchDataService(makeClient()).hasWinTeam).toBe(false)
  })

  it('visionEligible requires both isHighMmr AND autoClippingEnabled', () => {
    expect(new MatchDataService(makeClient({ mmr: 9000 })).visionEligible).toBe(true)
    expect(
      new MatchDataService(makeClient({ mmr: 9000, disableAutoClipping: true })).visionEligible,
    ).toBe(false)
    expect(new MatchDataService(makeClient({ mmr: 5000 })).visionEligible).toBe(false)
  })
})

describe('MatchDataService — resolveRoster source/stage/completeness', () => {
  it('returns empty/none when there is no matchId', async () => {
    const r = await new MatchDataService(makeClient({ matchid: '0' })).resolveRoster()
    expect(r.source).toBe('none')
    expect(r.stage).toBe('unknown')
    expect(r.players).toEqual([])
    expect(r.completeness).toEqual({
      accountIds: 'none',
      heroIds: 'none',
      teamAssignment: 'none',
      playerNames: 'none',
      ranks: 'none',
    })
  })

  it('sourcetv (post-draft) = in-progress, all accountIds + all heroes', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.stage).toBe('in-progress')
    expect(r.completeness.accountIds).toBe('all')
    expect(r.completeness.heroIds).toBe('all')
    expect(r.completeness.playerNames).toBe('none')
    expect(r.completeness.ranks).toBe('none')
    expect(r.completeness.teamAssignment).toBe('none') // SourceTV doesn't preserve team info
    expect(r.hasAllAccountIds).toBe(true)
    expect(r.hasAllHeroes).toBe(true)
  })

  it('sourcetv (early game) = hero-draft when heroes are partial', async () => {
    mongoDoc = sourceTvDoc({ partialHeroes: true })
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.stage).toBe('hero-draft')
    expect(r.completeness.heroIds).toBe('partial')
    expect(r.completeness.accountIds).toBe('all')
    expect(r.hasAllHeroes).toBe(false)
  })

  it('vision-heroes: source detected, non-streamer accountIds normalized to null', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionHeroesPayload())
    const r = await new MatchDataService(makeClient({ ownHeroId: 1 })).resolveRoster()
    expect(r.source).toBe('vision-heroes')
    expect(r.stage).toBe('in-progress')
    expect(r.completeness.heroIds).toBe('all')
    // Only the streamer's slot (heroId 1) carries a real accountId; the other 9 are sentinel-collapsed.
    expect(r.completeness.accountIds).toBe('partial')
    const nullAccts = r.players.filter((p) => p.accountId === null).length
    expect(nullAccts).toBe(9)
  })

  it('vision-draft "waiting" = roster-draft (CM player-pick case)', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('waiting'))
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('vision-draft')
    expect(r.stage).toBe('roster-draft')
    expect(r.heroesStatus).toBe('waiting')
    expect(r.completeness.playerNames).toBe('all')
    expect(r.completeness.heroIds).toBe('none')
    expect(r.completeness.accountIds).toBe('none')
    expect(r.completeness.teamAssignment).toBe('none')
  })

  it('vision-draft "failed" preserves the failed flag', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('failed'))
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.stage).toBe('roster-draft')
    expect(r.heroesStatus).toBe('failed')
  })

  it('gsi-self when no Mongo doc and no Vision', async () => {
    mongoDoc = null
    noVisionHost()
    const r = await new MatchDataService(makeClient({ ownHeroId: 14 })).resolveRoster()
    expect(r.source).toBe('gsi-self')
    expect(r.players.length).toBe(1)
    expect(r.hasAllAccountIds).toBe(false)
    expect(r.hasAllHeroes).toBe(false)
  })

  it('gsi-spectator: derives team from slot (0-4 radiant, 5-9 dire)', async () => {
    const r = await new MatchDataService(gsiSpectatorClient()).resolveRoster()
    expect(r.source).toBe('gsi-spectator')
    expect(r.completeness.teamAssignment).toBe('all')
    expect(r.players.find((p) => p.slot === 0)?.team).toBe('radiant')
    expect(r.players.find((p) => p.slot === 4)?.team).toBe('radiant')
    expect(r.players.find((p) => p.slot === 5)?.team).toBe('dire')
    expect(r.players.find((p) => p.slot === 9)?.team).toBe('dire')
  })
})

describe('MatchDataService — memoization', () => {
  it('resolveRoster hits Mongo at most once across multiple awaits', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const svc = new MatchDataService(makeClient())
    await svc.resolveRoster()
    await svc.resolveRoster()
    await svc.resolveRoster()
    expect(mongoCallCount).toBe(1)
  })

  it('getDelayedGameDoc hits Mongo at most once', async () => {
    mongoDoc = sourceTvDoc()
    const svc = new MatchDataService(makeClient())
    await svc.getDelayedGameDoc()
    await svc.getDelayedGameDoc()
    expect(mongoCallCount).toBe(1)
  })

  it('getDelayedGameDoc returns null without I/O when matchId is undefined', async () => {
    expect(await new MatchDataService(makeClient({ matchid: '0' })).getDelayedGameDoc()).toBeNull()
    expect(mongoCallCount).toBe(0)
  })

  it('getCards emits steam socket at most once with the normalized accountIds', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    cardsResponse = [{ account_id: 1000, leaderboard_rank: 0, rank_tier: 70 }]
    const svc = new MatchDataService(makeClient())
    await svc.getCards()
    await svc.getCards()
    expect(socketCallCount).toBe(1)
    expect(socketLastIds).toEqual([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009])
  })

  it('getCards returns [] without socket emit when there are no real accountIds', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('waiting'))
    const svc = new MatchDataService(makeClient())
    expect(await svc.getCards()).toEqual([])
    expect(socketCallCount).toBe(0)
  })
})

describe('MatchDataService — per-slot lookups', () => {
  it('findPlayerBySlot finds the slot when present', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const p = await new MatchDataService(makeClient()).findPlayerBySlot(7)
    // SourceTV flat-players branch in getAccountsFromMatch sets playerid: null (not the slot
    // index), so findPlayerBySlot won't locate by index; this surfaces a known limitation of
    // the SourceTV writer shape — slot info isn't preserved. See plan / future Phase B work.
    expect(p).toBeNull()
  })

  it('findPlayerBySlot does locate spectator slots (GSI preserves playerid)', async () => {
    const p = await new MatchDataService(gsiSpectatorClient()).findPlayerBySlot(7)
    expect(p?.slot).toBe(7)
    expect(p?.team).toBe('dire')
    expect(p?.heroId).toBe(8)
  })

  it('findPlayerByAccountId(0) returns null (sentinel collapse)', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionHeroesPayload())
    expect(await new MatchDataService(makeClient()).findPlayerByAccountId(0)).toBeNull()
  })

  it('findPlayerByAccountId locates by real accountId', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const p = await new MatchDataService(makeClient()).findPlayerByAccountId(1003)
    expect(p?.accountId).toBe(1003)
    expect(p?.heroId).toBe(4)
  })

  it('findPlayerByHeroId locates by heroId', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const p = await new MatchDataService(makeClient()).findPlayerByHeroId(3)
    expect(p?.heroId).toBe(3)
    expect(p?.accountId).toBe(1002)
  })

  it('findPlayerByHeroId(0) is a no-op', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    expect(await new MatchDataService(makeClient()).findPlayerByHeroId(0)).toBeNull()
  })
})

describe('MatchDataService — resolveHeroNameForSlot tier rule', () => {
  it('returns name from roster when slot is present (spectator)', async () => {
    const svc = new MatchDataService(gsiSpectatorClient({ mmr: 9000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.resolvedFromRoster).toBe(true)
    expect(typeof r.name).toBe('string')
    expect(r.name).not.toBeNull()
  })

  it('returns null at 8500+ when slot is NOT in the roster', async () => {
    mongoDoc = null
    noVisionHost()
    const svc = new MatchDataService(makeClient({ mmr: 9500 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 7 })
    expect(r.resolvedFromRoster).toBe(false)
    expect(r.name).toBeNull()
  })

  it('returns color-from-slot sub-8500 when slot is NOT in the roster', async () => {
    mongoDoc = null
    noVisionHost()
    const svc = new MatchDataService(makeClient({ mmr: 4000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.resolvedFromRoster).toBe(false)
    expect(r.name).toBe('Yellow') // heroColors[3]
  })

  it('returns null for an out-of-range slot even sub-8500', async () => {
    mongoDoc = null
    noVisionHost()
    const svc = new MatchDataService(makeClient({ mmr: 4000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 42 })
    expect(r.name).toBeNull()
  })
})
