// Regression tests for the Arteezy stale-GSI bug: `openTheBet` used to read
// matchId + hero name from `client.gsi` at delay-fire time, which can be
// cleared (player abandoned + requeued) between `openBets()` validating and
// `openTheBet()` running. The fix captures both values at validation time and
// passes them through the delayed callback closure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../__tests__/sharedMocks'

type InsertCall = { table: string; values: Record<string, unknown> }
type OpenBetCall = { heroName: string | undefined; matchidAtCallTime: string | undefined }
type DelayedTask = { delayMs: number; invoke: () => void | Promise<void> }

const supabaseInserts: InsertCall[] = []
const openBetCalls: OpenBetCall[] = []
const heldTasks: DelayedTask[] = []

const supabaseMock = {
  from: (table: string) => {
    let resolveSelect: any = { data: [], error: null }
    const builder: any = {
      select: () => builder,
      insert: (values: Record<string, unknown>) => {
        supabaseInserts.push({ table, values })
        return Promise.resolve({ data: null, error: null })
      },
      update: () => builder,
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => builder,
      is: () => Promise.resolve(resolveSelect),
      neq: () => builder,
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => Promise.resolve(resolveSelect),
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
      match: () => Promise.resolve({ data: null, error: null }),
      then: (onF: any) => Promise.resolve(resolveSelect).then(onF),
    }
    return builder
  },
  rpc: async () => ({ data: [], error: null }),
}

const loggerMock = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: supabaseMock, logger: loggerMock }),
)

vi.doMock('../../steam/ws', () => ({
  steamSocket: { emit: () => undefined, on: () => undefined },
  twitchChat: { emit: () => undefined, on: () => undefined },
  twitchEvents: { emit: () => undefined, on: () => undefined },
}))

vi.doMock('../../twitch/lib/openTwitchBet', () => ({
  openTwitchBet: async ({ heroName, client }: { heroName?: string; client: any }) => {
    openBetCalls.push({
      heroName,
      matchidAtCallTime: client?.gsi?.map?.matchid,
    })
    return { id: 'bet-id-1' }
  },
}))

vi.doMock('../lib/DelayedQueue', () => ({
  delayedQueue: {
    addTask: (
      delayMs: number,
      cb: (payload: unknown) => void | Promise<void>,
      payload?: unknown,
    ) => {
      heldTasks.push({ delayMs, invoke: () => cb(payload as unknown) })
      return `task-${heldTasks.length}`
    },
    removeTask: () => true,
  },
}))

// Avoid network/socket side effects from emitBadgeUpdate / emitWLUpdate. We
// bypass these by constructing with stream_online=false so the ctor early-
// returns, but the modules are still imported at file-load time so they
// need to load cleanly.
vi.doMock('../../db/getWL', async () => {
  const real = await vi.importActual<any>('../../db/getWL')
  return { ...real, getWL: async () => ({ record: [], hasParty: false }) }
})

vi.doMock('../lib/ranks', async () => {
  const real = await vi.importActual<any>('../lib/ranks')
  return {
    ...real,
    getRankDetail: async () => null,
    getOpenDotaProfile: async () => null,
    getRankTitle: () => 'Immortal',
    getRankDescription: async () => null,
  }
})

await initTestI18n()

const { redisClient } = await import('../../db/redisInstance')
const redisStore: Record<string, string> = {}
;(redisClient as any).client = {
  get: async (key: string) => redisStore[key] ?? null,
  set: async (key: string, val: string) => {
    redisStore[key] = val
    return 'OK'
  },
  del: async (key: string) => {
    delete redisStore[key]
    return 1
  },
  setEx: async (key: string, _ttl: number, val: string) => {
    redisStore[key] = val
    return 'OK'
  },
  multi: () => {
    const ops: Array<() => void> = []
    const chain: any = {
      del: (key: string) => {
        ops.push(() => {
          delete redisStore[key]
        })
        return chain
      },
      exec: async () => {
        ops.forEach((op) => op())
        return []
      },
    }
    return chain
  },
}

const { server } = await import('../server')
server.setServer({
  io: {
    to: () => ({ emit: () => undefined }),
    in: () => ({ fetchSockets: async () => [] }),
    fetchSockets: async () => [],
  },
} as any)

// Side-effect import: registers the GSIHandler constructor with the factory.
await import('../GSIHandler')
const { createGSIHandler } = await import('../GSIHandlerFactory')

type Client = any

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    name: 'arteezy',
    token: 'token-arteezy',
    stream_online: false, // ctor early-returns; we re-enable after construction
    locale: 'en',
    steam32Id: 86745912,
    mmr: 12000,
    Account: { providerAccountId: 'twitch-arteezy' },
    SteamAccount: [],
    settings: [],
    subscription: PRO_SUB,
    beta_tester: false,
    multiAccount: false,
    gsi: undefined,
    ...overrides,
  }
}

function liveGsi(overrides: Record<string, any> = {}) {
  return {
    map: { matchid: '8825999999', win_team: 'none', clock_time: 0, game_time: 0 },
    player: { activity: 'playing', team_name: 'radiant' },
    hero: { name: 'npc_dota_hero_nevermore' },
    ...overrides,
  }
}

function makeHandler(client: Client) {
  const handler = createGSIHandler(client) as any
  // ctor disabled the handler because stream_online was false; flip both
  // flags so openBets proceeds as if the streamer is live.
  handler.client.stream_online = true
  handler.disabled = false
  return handler
}

describe('openTheBet — Arteezy stale-GSI regression', () => {
  beforeEach(() => {
    supabaseInserts.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    for (const k of Object.keys(redisStore)) delete redisStore[k]
  })

  afterEach(() => {
    supabaseInserts.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
  })

  it('uses the matchId + hero captured at openBets time, even when GSI clears before the delayed openTheBet fires', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)

    expect(heldTasks.length).toBe(1)

    // Simulate the Arteezy scenario: between openBets and the delayed callback,
    // the game abandons and GSI clears (or a new game has begun and reset
    // wiped state). The captured matchId/hero must still flow through.
    handler.client.gsi.map = undefined
    handler.client.gsi.hero = undefined

    await heldTasks[0].invoke()

    expect(supabaseInserts.length).toBe(1)
    const insert = supabaseInserts[0]
    expect(insert.table).toBe('matches')
    expect(insert.values.matchId).toBe('8825999999')
    expect(insert.values.hero_name).toBe('npc_dota_hero_nevermore')
    expect(insert.values.predictionId).toBe('bet-id-1')

    expect(openBetCalls.length).toBe(1)
    expect(openBetCalls[0].heroName).toBe('Shadow Fiend')
  })

  it('does not insert a matches row or open a twitch prediction when openTheBet is invoked with no matchId', async () => {
    const client = makeClient({ gsi: liveGsi() })
    const handler = makeHandler(client)

    await handler.openTheBet('', '')

    expect(supabaseInserts.length).toBe(0)
    expect(openBetCalls.length).toBe(0)
    expect(handler.openingBets).toBe(false)
  })

  it('inserts with the valid matchId, hero, and predictionId on the happy path', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825339220', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    expect(heldTasks.length).toBe(1)

    await heldTasks[0].invoke()

    expect(supabaseInserts.length).toBe(1)
    const insert = supabaseInserts[0]
    expect(insert.values.matchId).toBe('8825339220')
    expect(insert.values.hero_name).toBe('npc_dota_hero_nevermore')
    expect(insert.values.predictionId).toBe('bet-id-1')

    expect(openBetCalls[0].heroName).toBe('Shadow Fiend')
  })
})
