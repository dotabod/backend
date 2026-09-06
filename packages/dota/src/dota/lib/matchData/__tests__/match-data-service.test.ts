import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock } from '../../../../__tests__/shared-mocks.ts'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

// Per-test supabase rows for the streamers-in-match count test.
let matchesRows: { userId: string | null }[] = []
let steamAccountsRows: { userId: string | null }[] = []
const supabaseStub = {
  from: (table: string) => {
    if (table === 'matches') {
      return {
        select: () => ({
          eq: async () => ({ data: matchesRows }),
        }),
      }
    }
    return {
      select: () => ({
        in: async () => ({ data: steamAccountsRows }),
      }),
    }
  },
}

vi.doMock(import('@dotabod/shared-utils'), () =>
  buildSharedUtilsMock({ logger: noopLogger, supabase: supabaseStub })
)

// Lower-level mocks (Mongo + steam socket). We let the real ResolverChain run end-to-end against
// our controlled Mongo doc / Vision fetch / GSI fixtures — no module-level mocking of the chain
// itself.

let mongoDoc: unknown = null
let mongoCallCount = 0
// Tests can install a one-shot override that runs in place of the default
// `findOne` body — used by retry-after-error scenarios. Cleared after firing
// to fall back to the steady-state mock.
let mongoFindOneOverride: (() => Promise<unknown>) | null = null

vi.doMock(import('../../../../steam/mongo-db-singleton'), () => ({
  default: {
    close: async () => {},
    connect: async () => ({
      collection: () => ({
        findOne: async () => {
          if (mongoFindOneOverride) {
            const override = mongoFindOneOverride
            return await override()
          }
          mongoCallCount += 1
          return mongoDoc
        },
      }),
    }),
  },
}))

let cardsResponse: Record<string, unknown>[] = []
let socketCallCount = 0
let socketLastIds: number[] = []

vi.doMock(import('../../../../steam/ws'), () => ({
  steamSocket: {
    emit: (
      _event: string,
      ids: number[],
      _refetch: boolean,
      cb: (err: unknown, cards: unknown) => void
    ) => {
      socketCallCount += 1
      socketLastIds = ids
      cb(null, cardsResponse)
    },
  },
  twitchChat: { on: () => {} },
}))

const { MatchDataService } = await import('../match-data-service.ts')

// --- Vision API mock via global fetch ---
const realFetch = globalThis.fetch
const origVisionHost = process.env.VISION_API_HOST
const origVisionKey = process.env.VISION_API_KEY
const mockVision = function mockVision(payload: unknown, ok = true) {
  globalThis.fetch = (async () => ({ json: async () => payload, ok })) as unknown as typeof fetch
}
const noVisionHost = function noVisionHost() {
  delete process.env.VISION_API_HOST
}
const withVisionHost = function withVisionHost() {
  process.env.VISION_API_HOST = 'vision.test'
  process.env.VISION_API_KEY = 'key'
}

afterEach(() => {
  globalThis.fetch = realFetch
  if (origVisionHost === undefined) {
    delete process.env.VISION_API_HOST
  } else {
    process.env.VISION_API_HOST = origVisionHost
  }
  if (origVisionKey === undefined) {
    delete process.env.VISION_API_KEY
  } else {
    process.env.VISION_API_KEY = origVisionKey
  }
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

const makeClient = function makeClient(o: ClientOverrides = {}): any {
  const matchid = o.matchid === undefined ? '8800000001' : o.matchid
  const ownAccountId = o.ownAccountId ?? '111'
  const baseGsi = matchid
    ? {
        hero: o.ownHeroId === undefined ? undefined : { id: o.ownHeroId },
        map: { customgamename: '', matchid, win_team: 'none' },
        player: { accountid: ownAccountId, team_name: 'radiant' },
      }
    : {
        hero: undefined,
        map: { customgamename: '' },
        player: { accountid: ownAccountId, team_name: 'radiant' },
      }
  return {
    SteamAccount: [
      {
        leaderboard_rank: o.leaderboard_rank ?? null,
        mmr: o.mmr ?? 4000,
        name: 'self',
        steam32Id: 111,
      },
    ],
    gsi: o.gsi ?? baseGsi,
    locale: 'en',
    mmr: o.mmr ?? 4000,
    name: 'channel',
    settings: o.disableAutoClipping ? [{ key: 'disableAutoClipping', value: true }] : [],
    steam32Id: o.steam32Id === undefined ? 111 : o.steam32Id,
    stream_online: o.stream_online ?? true,
    subscription: { isGift: false, status: 'ACTIVE', tier: 'PRO' },
    token: 'broadcaster',
  }
}

const sourceTvDoc = function sourceTvDoc(opts: { partialHeroes?: boolean } = {}) {
  return {
    average_mmr: 6500,
    match: { game_mode: 22, lobby_type: 7, match_id: '8800000001' },
    players: Array.from({ length: 10 }, (_, i) => ({
      accountid: 1000 + i,
      heroid: opts.partialHeroes && i >= 7 ? 0 : i + 1,
    })),
    spectators: 3,
  }
}

const visionHeroesPayload = function visionHeroesPayload() {
  return {
    heroes: Array.from({ length: 10 }, (_, i) => ({
      hero_id: i + 1,
      hero_localized_name: `Hero ${i + 1}`,
      hero_name: `hero${i + 1}`,
      match_score: 100,
      player_id: i,
      player_name: `Player ${i + 1}`,
      position: i,
      rank: 8500 + i * 50,
      team: i < 5 ? 'radiant' : 'dire',
      variant: '',
    })),
    match_id: '8800000001',
    players: [],
  }
}

const visionDraftPayload = function visionDraftPayload(
  heroes_status: 'waiting' | 'failed' = 'waiting'
) {
  return {
    draft_player_order: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    heroes: [],
    heroes_status,
    match_id: '8800000001',
  }
}

const gsiSpectatorClient = function gsiSpectatorClient(o: ClientOverrides = {}): any {
  const team2 = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }])
  )
  const team3 = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { id: i + 1, selected_unit: false }])
  )
  const team2Players = Object.fromEntries(
    [0, 1, 2, 3, 4].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }])
  )
  const team3Players = Object.fromEntries(
    [5, 6, 7, 8, 9].map((i) => [`player${i}`, { accountid: 2000 + i, name: `P${i}` }])
  )
  return makeClient({
    ...o,
    gsi: {
      hero: { team2, team3 },
      map: { customgamename: '', matchid: '8800000001', win_team: 'none' },
      player: {
        accountid: '111',
        team2: team2Players,
        team3: team3Players,
        team_name: 'spectator',
      },
    },
  })
}

beforeEach(() => {
  mongoDoc = null
  mongoCallCount = 0
  cardsResponse = []
  socketCallCount = 0
  socketLastIds = []
  matchesRows = []
  steamAccountsRows = []
  globalThis.fetch = realFetch
})

describe('MatchDataService — sync getters', () => {
  it('treats matchid "0" as undefined', () => {
    expect(new MatchDataService(makeClient({ matchid: '0' })).matchId).toBeUndefined()
  })

  it('hasSteam32Id reflects client.steam32Id', () => {
    expect(new MatchDataService(makeClient({ steam32Id: null })).hasSteam32Id).toBeFalsy()
    expect(new MatchDataService(makeClient({ steam32Id: 42 })).hasSteam32Id).toBeTruthy()
  })

  it('isStreamOnline reflects client.stream_online', () => {
    expect(new MatchDataService(makeClient({ stream_online: false })).isStreamOnline).toBeFalsy()
    expect(new MatchDataService(makeClient({ stream_online: true })).isStreamOnline).toBeTruthy()
  })

  it('isHighMmr is true on >8500 mmr', () => {
    expect(new MatchDataService(makeClient({ mmr: 9000 })).isHighMmr).toBeTruthy()
  })

  it('isHighMmr is true when steam_account has leaderboard rank', () => {
    expect(
      new MatchDataService(makeClient({ leaderboard_rank: 500, mmr: 100 })).isHighMmr
    ).toBeTruthy()
  })

  it('isHighMmr is false sub-8500 with no leaderboard', () => {
    expect(new MatchDataService(makeClient({ mmr: 5000 })).isHighMmr).toBeFalsy()
  })

  it('isArcade reflects gsi customgamename', () => {
    const arcadeClient = makeClient({
      gsi: { map: { customgamename: 'overthrow', matchid: '1' }, player: { accountid: '111' } },
    })
    expect(new MatchDataService(arcadeClient).isArcade).toBeTruthy()
    expect(new MatchDataService(makeClient()).isArcade).toBeFalsy()
  })

  it('hasWinTeam true when win_team is radiant/dire, false for "none"', () => {
    const winning = makeClient({
      gsi: { map: { customgamename: '', matchid: '1', win_team: 'radiant' } },
    })
    expect(new MatchDataService(winning).hasWinTeam).toBeTruthy()
    expect(new MatchDataService(makeClient()).hasWinTeam).toBeFalsy()
  })

  it('visionEligible requires both isHighMmr AND autoClippingEnabled', () => {
    expect(new MatchDataService(makeClient({ mmr: 9000 })).visionEligible).toBeTruthy()
    expect(
      new MatchDataService(makeClient({ disableAutoClipping: true, mmr: 9000 })).visionEligible
    ).toBeFalsy()
    expect(new MatchDataService(makeClient({ mmr: 5000 })).visionEligible).toBeFalsy()
  })
})

describe('MatchDataService — resolveRoster source/stage/completeness', () => {
  it('returns empty/none when there is no matchId AND no streamer GSI data', async () => {
    const client = makeClient({ matchid: '0', ownAccountId: undefined })
    client.gsi = undefined
    const r = await new MatchDataService(client).resolveRoster()
    expect(r.source).toBe('none')
    expect(r.stage).toBe('unknown')
    expect(r.players).toStrictEqual([])
  })

  it("surfaces the streamer's GSI-self row even when matchid is '0'", async () => {
    mongoDoc = null
    noVisionHost()
    const r = await new MatchDataService(
      makeClient({ matchid: '0', ownAccountId: '111', ownHeroId: 14 })
    ).resolveRoster()
    expect(r.source).toBe('gsi-self')
    expect(r.players).toHaveLength(1)
    expect(r.players[0].accountId).toBe(111)
    expect(r.players[0].heroId).toBe(14)
  })

  it('sourcetv (post-draft) = in-progress, all accountIds + all heroes', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.stage).toBe('in-progress')
    expect(r.completeness.accountIds).toBe('all')
    expect(r.completeness.heroIds).toBe('all')
    expect(r.completeness.teamAssignment).toBe('none')
    expect(r.hasAllAccountIds).toBeTruthy()
    expect(r.hasAllHeroes).toBeTruthy()
  })

  it('sourcetv (early game) = hero-draft when heroes are partial', async () => {
    mongoDoc = sourceTvDoc({ partialHeroes: true })
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.stage).toBe('hero-draft')
    expect(r.completeness.heroIds).toBe('partial')
    expect(r.completeness.accountIds).toBe('all')
  })

  it('vision-heroes: source detected, non-streamer accountIds normalized to null', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionHeroesPayload())
    const r = await new MatchDataService(makeClient({ ownHeroId: 1 })).resolveRoster()
    expect(r.source).toBe('vision-heroes')
    expect(r.completeness.heroIds).toBe('all')
    expect(r.completeness.accountIds).toBe('partial')
    expect(r.players.filter((p) => p.accountId === null)).toHaveLength(9)
  })

  it('vision-draft "waiting" = roster-draft (CM player-pick)', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('waiting'))
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('vision-draft')
    expect(r.stage).toBe('roster-draft')
    expect(r.heroesStatus).toBe('waiting')
    expect(r.completeness.playerNames).toBe('all')
    expect(r.completeness.heroIds).toBe('none')
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
    expect(r.players).toHaveLength(1)
  })

  it('gsi-spectator: derives team from slot', async () => {
    const r = await new MatchDataService(gsiSpectatorClient()).resolveRoster()
    expect(r.source).toBe('gsi-spectator')
    expect(r.completeness.teamAssignment).toBe('all')
    expect(r.players.find((p) => p.slot === 0)?.team).toBe('radiant')
    expect(r.players.find((p) => p.slot === 9)?.team).toBe('dire')
  })

  it('gsi-spectator: preserves the `selected: true` flag', async () => {
    const client = gsiSpectatorClient()
    client.gsi.hero.team2.player3.selected_unit = true
    const r = await new MatchDataService(client).resolveRoster()
    expect(r.players.find((p) => p.slot === 3)?.selected).toBeTruthy()
    expect(r.players.find((p) => p.slot === 7)?.selected).toBeFalsy()
  })

  it('non-spectator sources have selected: null', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.players.every((p) => p.selected === null)).toBeTruthy()
  })

  it("length===1 Mongo response is tagged 'sourcetv', not 'gsi-self'", async () => {
    mongoDoc = {
      match: { match_id: '8800000001' },
      players: [{ accountid: 999_999, heroid: 5 }],
    }
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.players[0].accountId).toBe(999_999)
  })
})

describe('MatchDataService — account-linked roster names', () => {
  it('never mixes Vision OCR names into a SourceTV roster', async () => {
    mongoDoc = sourceTvDoc()
    withVisionHost()
    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      return { json: async () => visionHeroesPayload(), ok: true }
    }) as unknown as typeof fetch
    const r = await new MatchDataService(makeClient()).resolveRoster()

    expect(r.source).toBe('sourcetv')
    expect(r.players).toHaveLength(10)
    expect(r.players.every((p) => p.accountId !== null)).toBeTruthy()
    expect(r.players.every((p) => p.playerName === null)).toBeTruthy()
    expect(fetchCalled).toBeFalsy()
  })

  it('does not overwrite a name the winning resolver already knows', async () => {
    mongoDoc = {
      match: { match_id: '8800000001' },
      players: [
        { accountid: 1000, heroid: 1, player_name: 'KnownPro' },
        { accountid: 1001, heroid: 2 },
      ],
    }
    withVisionHost()
    mockVision(visionHeroesPayload())
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.players.find((p) => p.heroId === 1)?.playerName).toBe('KnownPro')
    expect(r.players.find((p) => p.heroId === 2)?.playerName).toBeNull()
  })

  it('skips the Vision fetch entirely when every player already has a name', async () => {
    mongoDoc = {
      match: { match_id: '8800000001' },
      players: [{ accountid: 1000, heroid: 1, player_name: 'KnownPro' }],
    }
    withVisionHost()
    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      return { json: async () => visionHeroesPayload(), ok: true }
    }) as unknown as typeof fetch
    await new MatchDataService(makeClient()).resolveRoster()
    expect(fetchCalled).toBeFalsy()
  })

  it('leaves names untouched when Vision has nothing (no host configured)', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const r = await new MatchDataService(makeClient()).resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(r.players.every((p) => p.playerName === null)).toBeTruthy()
  })
})

describe('MatchDataService — typed delayedGames accessors', () => {
  beforeEach(() => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
  })

  it('getAverageMmr reads from the delayedGames doc', async () => {
    await expect(new MatchDataService(makeClient()).getAverageMmr()).resolves.toBe(6500)
  })

  it('getGameMode reads from match.game_mode', async () => {
    await expect(new MatchDataService(makeClient()).getGameMode()).resolves.toBe(22)
  })

  it('getLobbyType reads from match.lobby_type', async () => {
    await expect(new MatchDataService(makeClient()).getLobbyType()).resolves.toBe(7)
  })

  it('getSpectatorCount reads from spectators', async () => {
    await expect(new MatchDataService(makeClient()).getSpectatorCount()).resolves.toBe(3)
  })

  it('all four accessors share ONE Mongo fetch (memoized via getDelayedGameDoc)', async () => {
    const svc = new MatchDataService(makeClient())
    await Promise.all([
      svc.getAverageMmr(),
      svc.getGameMode(),
      svc.getLobbyType(),
      svc.getSpectatorCount(),
    ])
    expect(mongoCallCount).toBe(1)
  })

  it('all four return null when there is no doc', async () => {
    mongoDoc = null
    const svc = new MatchDataService(makeClient())
    await expect(svc.getAverageMmr()).resolves.toBeNull()
    await expect(svc.getGameMode()).resolves.toBeNull()
    await expect(svc.getLobbyType()).resolves.toBeNull()
    await expect(svc.getSpectatorCount()).resolves.toBeNull()
  })
})

describe('MatchDataService — projections (getAccountIds / getHeroesStatus)', () => {
  it('getAccountIds dedupes and drops 0/null accountIds', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const ids = await new MatchDataService(makeClient()).getAccountIds()
    expect(ids).toStrictEqual([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009])
  })

  it('getHeroesStatus passes through "waiting" on vision-draft', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('waiting'))
    await expect(new MatchDataService(makeClient()).getHeroesStatus()).resolves.toBe('waiting')
  })

  it('getHeroesStatus is undefined for sources without it', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    await expect(new MatchDataService(makeClient()).getHeroesStatus()).resolves.toBeUndefined()
  })

  it('projections share ONE resolveRoster call (memoized)', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const svc = new MatchDataService(makeClient())
    await Promise.all([svc.getAccountIds(), svc.resolveRoster(), svc.getHeroesStatus()])
    expect(mongoCallCount).toBe(1)
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

  it('getDelayedGameDoc returns null without I/O when matchId is undefined', async () => {
    await expect(
      new MatchDataService(makeClient({ matchid: '0' })).getDelayedGameDoc()
    ).resolves.toBeNull()
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
    expect(socketLastIds).toStrictEqual([
      1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009,
    ])
  })

  it('getCards returns [] without socket emit when there are no real accountIds', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionDraftPayload('waiting'))
    const svc = new MatchDataService(makeClient())
    await expect(svc.getCards()).resolves.toStrictEqual([])
    expect(socketCallCount).toBe(0)
  })

  it('getCards dedups duplicate accountIds before emitting the socket', async () => {
    mongoDoc = {
      match: { match_id: '8800000001' },
      players: [
        { accountid: 555, heroid: 1 },
        { accountid: 555, heroid: 2 },
        { accountid: 666, heroid: 3 },
      ],
    }
    noVisionHost()
    await new MatchDataService(makeClient()).getCards()
    expect(socketLastIds).toStrictEqual([555, 666])
  })

  it('getCards REJECTS on socket error (preserves the error signal)', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const ws = await import('../../../../steam/ws')
    const realEmit = ws.steamSocket.emit.bind(ws.steamSocket)
    ws.steamSocket.emit = ((
      _event: string,
      _ids: number[],
      _refetch: boolean,
      cb: (err: unknown, cards: unknown) => void
    ) => {
      cb(new Error('socket boom'), null)
    }) as typeof ws.steamSocket.emit
    let caught: unknown = null
    try {
      await new MatchDataService(makeClient()).getCards()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('socket boom')
    ws.steamSocket.emit = realEmit
  })

  it('rejected memoization clears the slot — retry can succeed', async () => {
    let calls = 0
    mongoFindOneOverride = async () => {
      calls += 1
      if (calls === 1) {
        throw new Error('transient mongo')
      }
      return sourceTvDoc()
    }
    noVisionHost()
    const svc = new MatchDataService(makeClient())
    let firstErr: unknown = null
    try {
      await svc.resolveRoster()
    } catch (error) {
      firstErr = error
    }
    expect(firstErr).toBeInstanceOf(Error)
    const r = await svc.resolveRoster()
    expect(r.source).toBe('sourcetv')
    expect(calls).toBe(2)
    mongoFindOneOverride = null
  })
})

describe('MatchDataService — per-slot lookups + getSelf + focused spectator', () => {
  it('findPlayerBySlot returns null for NaN', async () => {
    await expect(
      new MatchDataService(makeClient()).findPlayerBySlot(Number.NaN)
    ).resolves.toBeNull()
  })

  it('findPlayerBySlot locates spectator slots', async () => {
    const p = await new MatchDataService(gsiSpectatorClient()).findPlayerBySlot(7)
    expect(p?.slot).toBe(7)
    expect(p?.team).toBe('dire')
    expect(p?.heroId).toBe(8)
  })

  it('findPlayerByAccountId(0) returns null (sentinel collapse)', async () => {
    mongoDoc = null
    withVisionHost()
    mockVision(visionHeroesPayload())
    await expect(new MatchDataService(makeClient()).findPlayerByAccountId(0)).resolves.toBeNull()
  })

  it('findPlayerByAccountId locates by real accountId', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    const p = await new MatchDataService(makeClient()).findPlayerByAccountId(1003)
    expect(p?.accountId).toBe(1003)
    expect(p?.heroId).toBe(4)
  })

  it('findPlayerByHeroId(0) is a no-op', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    await expect(new MatchDataService(makeClient()).findPlayerByHeroId(0)).resolves.toBeNull()
  })

  it("getSelf returns the broadcaster's own RosterPlayer when present", async () => {
    mongoDoc = {
      match: { match_id: '8800000001' },
      players: [
        // streamer (steam32Id 111)
        { accountid: 111, heroid: 14 },
        { accountid: 222, heroid: 99 },
      ],
    }
    noVisionHost()
    const p = await new MatchDataService(makeClient()).getSelf()
    expect(p?.accountId).toBe(111)
    expect(p?.heroId).toBe(14)
  })

  it('getSelf returns null when steam32Id is unset', async () => {
    await expect(
      new MatchDataService(makeClient({ steam32Id: null })).getSelf()
    ).resolves.toBeNull()
  })

  it('getFocusedSpectatorPlayer returns the unit with `selected: true`', async () => {
    const client = gsiSpectatorClient()
    client.gsi.hero.team3.player7.selected_unit = true
    const p = await new MatchDataService(client).getFocusedSpectatorPlayer()
    expect(p?.slot).toBe(7)
  })

  it('getFocusedSpectatorPlayer returns null in non-spectator sources', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    await expect(new MatchDataService(makeClient()).getFocusedSpectatorPlayer()).resolves.toBeNull()
  })
})

describe('MatchDataService — resolveHeroNameForSlot tier rule', () => {
  it('returns name from roster when slot is present (spectator)', async () => {
    const svc = new MatchDataService(gsiSpectatorClient({ mmr: 9000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.resolvedFromRoster).toBeTruthy()
    expect(r.name).not.toBeNull()
  })

  it('returns null at 8500+ when slot is NOT in the roster', async () => {
    mongoDoc = null
    noVisionHost()
    const svc = new MatchDataService(makeClient({ mmr: 9500 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 7 })
    expect(r.resolvedFromRoster).toBeFalsy()
    expect(r.name).toBeNull()
  })

  it('returns color-from-slot sub-8500 when slot is NOT in the roster', async () => {
    mongoDoc = null
    noVisionHost()
    const svc = new MatchDataService(makeClient({ mmr: 4000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.name).toBe('Yellow')
  })

  it('returns null for NaN eventPlayerId at any tier', async () => {
    const svc = new MatchDataService(makeClient({ mmr: 4000 }))
    const r = await svc.resolveHeroNameForSlot({ eventPlayerId: Number.NaN })
    expect(r.name).toBeNull()
  })

  it('in-roster slot but heroId=null at 8500+ → suppresses (no color guess)', async () => {
    const client = gsiSpectatorClient({ mmr: 9500 })
    client.gsi.hero.team2.player3.id = 0
    const r = await new MatchDataService(client).resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.resolvedFromRoster).toBeTruthy()
    expect(r.name).toBeNull()
  })

  it('in-roster slot but heroId=null sub-8500 → returns color (safe)', async () => {
    const client = gsiSpectatorClient({ mmr: 4000 })
    client.gsi.hero.team2.player3.id = 0
    const r = await new MatchDataService(client).resolveHeroNameForSlot({ eventPlayerId: 3 })
    expect(r.name).toBe('Yellow')
  })
})

describe('MatchDataService — getStreamersInMatchCount', () => {
  it('counts other live streamers from the matches table + roster supplement', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    matchesRows = [{ userId: 'me' }, { userId: 'a' }]
    steamAccountsRows = [{ userId: 'b' }]
    const count = await new MatchDataService(makeClient()).getStreamersInMatchCount({
      excludeUserId: 'me',
    })
    // a + b
    expect(count).toBe(2)
  })

  it('dedupes a user appearing in both sources', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    matchesRows = [{ userId: 'a' }]
    steamAccountsRows = [{ userId: 'a' }, { userId: 'b' }]
    const count = await new MatchDataService(makeClient()).getStreamersInMatchCount({
      excludeUserId: 'me',
    })
    expect(count).toBe(2)
  })

  it('excludes the broadcaster from both sources', async () => {
    mongoDoc = sourceTvDoc()
    noVisionHost()
    matchesRows = [{ userId: 'me' }]
    steamAccountsRows = [{ userId: 'me' }]
    const count = await new MatchDataService(makeClient()).getStreamersInMatchCount({
      excludeUserId: 'me',
    })
    expect(count).toBe(0)
  })

  it('returns 0 with no roster + no matches rows', async () => {
    mongoDoc = null
    noVisionHost()
    const client = makeClient({ matchid: '0', ownAccountId: undefined })
    client.gsi = undefined
    const count = await new MatchDataService(client).getStreamersInMatchCount({
      excludeUserId: 'me',
    })
    expect(count).toBe(0)
  })
})
