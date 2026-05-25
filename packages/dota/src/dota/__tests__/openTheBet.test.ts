// Regression tests for the Arteezy stale-GSI bug: `openTheBet` used to read
// matchId + hero name from `client.gsi` at delay-fire time, which can be
// cleared (player abandoned + requeued) between `openBets()` validating and
// `openTheBet()` running. The fix captures both values at validation time and
// passes them through the delayed callback closure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../__tests__/sharedMocks'

type InsertCall = { table: string; values: Record<string, unknown> }
type OpenBetCall = { heroName: string | undefined; matchidAtCallTime: string | undefined }
type DelayedTask = {
  id: string
  delayMs: number
  invoke: () => void | Promise<void>
  cancelled: boolean
}

const supabaseInserts: InsertCall[] = []
const openBetCalls: OpenBetCall[] = []
const heldTasks: DelayedTask[] = []
const removedTaskIds: string[] = []
const openTwitchBetControl: { throwOnNextCall: Error | null } = { throwOnNextCall: null }
// Existing rows the supabase mock returns from a `.select(...).eq.eq.is(...)`
// chain (the openBets duplicate-bet check at line 712-718). Default: empty.
const existingBetRows: Array<Record<string, unknown>> = []

const supabaseMock = {
  from: (table: string) => {
    const builder: any = {
      // openBets duplicate-check chain (.select.eq.eq.is) resolves with
      // existingBetRows; the existing-bet branch only fires when the test
      // seeds at least one row.
      select: () => builder,
      insert: (values: Record<string, unknown>) => {
        supabaseInserts.push({ table, values })
        return Promise.resolve({ data: null, error: null })
      },
      update: () => builder,
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => builder,
      is: () => Promise.resolve({ data: existingBetRows.slice(), error: null }),
      neq: () => builder,
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: existingBetRows.slice(), error: null }),
      single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
      match: () => Promise.resolve({ data: null, error: null }),
      then: (onF: any) => Promise.resolve({ data: existingBetRows.slice(), error: null }).then(onF),
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
    if (openTwitchBetControl.throwOnNextCall) {
      const e = openTwitchBetControl.throwOnNextCall
      openTwitchBetControl.throwOnNextCall = null
      throw e
    }
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
      const id = `task-${heldTasks.length + 1}`
      const task: DelayedTask = {
        id,
        delayMs,
        cancelled: false,
        invoke: async () => {
          if (task.cancelled) return
          await cb(payload as unknown)
        },
      }
      heldTasks.push(task)
      return id
    },
    removeTask: (id: string) => {
      removedTaskIds.push(id)
      const task = heldTasks.find((t) => t.id === id)
      if (task) task.cancelled = true
      return !!task
    },
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
    removedTaskIds.length = 0
    existingBetRows.length = 0
    openTwitchBetControl.throwOnNextCall = null
    for (const k of Object.keys(redisStore)) delete redisStore[k]
  })

  afterEach(() => {
    supabaseInserts.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    removedTaskIds.length = 0
    existingBetRows.length = 0
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

  it('skips queueing openTheBet when a matches row already exists for the matchId (duplicate-prevention regression guard)', async () => {
    // Code-review finding: original mock returned no rows for any select, so
    // the duplicate-prevention branch in openBets (line 736) was unverified.
    // A future refactor moving the queue-add above the duplicate check would
    // pass tests but double-open Twitch predictions in prod.
    existingBetRows.push({
      id: 'existing-row',
      matchId: '8825999999',
      myTeam: 'radiant',
    })
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)

    expect(heldTasks.length).toBe(0)
    expect(handler.openingBets).toBe(false)
  })

  it('cleans up Redis matchId/playingTeam/playingHero when openTheBet bails without inserting a row', async () => {
    // Code-review finding: openBets writes 3 Redis keys before queueing
    // openTheBet. If openTheBet later bails (unrecognized hero, twitch
    // failure, empty-arg defense), the keys are orphaned — closeBets reads
    // ${token}:matchId, finds the matchId, updates zero matches rows
    // silently, and checkEarlyDCWinner's .single() then errors out.
    const client = makeClient({
      gsi: liveGsi({
        map: { matchid: '8825999999', win_team: 'none' },
        hero: { name: 'npc_dota_hero_does_not_exist' },
      }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    expect(redisStore['token-arteezy:matchId']).toBe('8825999999')

    await heldTasks[0].invoke()

    expect(redisStore['token-arteezy:matchId']).toBeUndefined()
    expect(redisStore['token-arteezy:playingTeam']).toBeUndefined()
    expect(redisStore['token-arteezy:playingHero']).toBeUndefined()
  })

  it('bails without opening a prediction or inserting a row when the captured hero is unrecognized by getHero', async () => {
    // Code-review finding: openBets only checks `gsi.hero?.name?.length`
    // truthiness — a non-canonical hero string (modded game, custom hero,
    // future Valve schema change) reaches openTheBet. getHero returns null,
    // openTwitchBet builds a title with empty heroName, reproducing the
    // original "Will we win with " bug. Treat unresolved hero as missing.
    const client = makeClient({
      gsi: liveGsi({
        map: { matchid: '8825999999', win_team: 'none' },
        hero: { name: 'npc_dota_hero_does_not_exist' },
      }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    await heldTasks[0].invoke()

    expect(openBetCalls.length).toBe(0)
    expect(supabaseInserts.length).toBe(0)
    expect(handler.openingBets).toBe(false)
  })

  it('does not insert a matches row when openTwitchBet throws (no phantom row without a Twitch prediction)', async () => {
    // Code-review finding: the old finally-block insert ran even when
    // openTwitchBet rejected (e.g. Twitch ACTIVE_PREDICTION conflict from the
    // stale-task cascade, scope revoked, 5xx). That produced rows the
    // streamer's chat was never told about — phantom unresolved matches.
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)
    openTwitchBetControl.throwOnNextCall = new Error('ACTIVE_PREDICTION')

    await handler.openBets(handler.client)
    await heldTasks[0].invoke()

    expect(openBetCalls.length).toBe(1)
    expect(supabaseInserts.length).toBe(0)
    expect(handler.openingBets).toBe(false)
  })

  it('snapshots myTeam at openBets time so the matches insert keeps the team even if GSI clears', async () => {
    // Code-review finding: matchId + heroName were snapshotted in the first
    // pass of the fix, but myTeam stayed as a stale `client.gsi?.player?.team_name`
    // read inside the finally block. Same race window — gives an empty team
    // in the matches row when GSI clears between openBets and openTheBet.
    const client = makeClient({
      gsi: liveGsi({
        map: { matchid: '8825999999', win_team: 'none' },
        player: { activity: 'playing', team_name: 'dire' },
      }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    expect(heldTasks.length).toBe(1)

    handler.client.gsi.player = undefined
    handler.client.gsi.map = undefined
    handler.client.gsi.hero = undefined

    await heldTasks[0].invoke()

    expect(supabaseInserts.length).toBe(1)
    expect(supabaseInserts[0].values.myTeam).toBe('dire')
  })

  it('cancels the queued openTheBet task when resetClientState fires before the delay elapses (prevents stale-match cascade)', async () => {
    // Code-review finding: between openBets queueing openTheBet and the
    // stream-delay elapsing, closeBets / early-DC / abandoned-game paths can
    // call resetClientState. Without cancellation, the stale task fires for
    // the abandoned match and opens an orphan Twitch prediction — which then
    // blocks the next match's openTwitchBet (Twitch allows only 1 active
    // prediction), producing the exact Arteezy → Muerta NULL-predictionId
    // cascade the user reported.
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    expect(heldTasks.length).toBe(1)
    const queuedTaskId = heldTasks[0].id

    // Match ends abruptly (close + reset, or early-DC handler reset).
    await handler.resetClientState()

    // The task must have been removed from the queue; firing it should be a no-op.
    expect(removedTaskIds).toContain(queuedTaskId)
    expect(heldTasks[0].cancelled).toBe(true)

    await heldTasks[0].invoke()
    expect(supabaseInserts.length).toBe(0)
    expect(openBetCalls.length).toBe(0)
  })
})
