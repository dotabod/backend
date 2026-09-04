// Regression tests for the Arteezy stale-GSI bug: `openTheBet` used to read
// matchId + hero name from `client.gsi` at delay-fire time, which can be
// cleared (player abandoned + requeued) between `openBets()` validating and
// `openTheBet()` running. The fix captures both values at validation time and
// passes them through the delayed callback closure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../__tests__/sharedMocks'

type InsertCall = { table: string; values: Record<string, unknown> }
type UpdateCall = { table: string; values: Record<string, unknown> }
type OpenBetCall = { heroName: string | undefined; matchidAtCallTime: string | undefined }
type DelayedTask = {
  id: string
  delayMs: number
  invoke: () => void | Promise<void>
  cancelled: boolean
}

const supabaseInserts: InsertCall[] = []
const supabaseUpdates: UpdateCall[] = []
const steamAccountSelectCalls: number[] = []
const loggerErrorCalls: Array<{ message: string; meta?: Record<string, unknown> }> = []
const loggerInfoCalls: Array<{ message: string; meta?: Record<string, unknown> }> = []
const openBetCalls: OpenBetCall[] = []
const closeBetCalls: unknown[][] = []
const sayCalls: Array<{ message: string; options?: Record<string, unknown> }> = []
const ioEmitCalls: Array<{
  token: string
  event: string
  payload: unknown
  trailingPayloads?: unknown[]
}> = []
const heldTasks: DelayedTask[] = []
const removedTaskIds: string[] = []
const openTwitchBetControl: { throwOnNextCall: Error | null } = { throwOnNextCall: null }
const matchPredictionLookup: {
  data: { predictionId: string | null } | null
  error: { message: string } | null
} = { data: null, error: null }
// Existing rows the supabase mock returns from a `.select(...).eq.eq.is(...)`
// chain (the openBets duplicate-bet check at line 712-718). Default: empty.
const existingBetRows: Array<Record<string, unknown>> = []
const steamAccountLookup: {
  data: Record<string, unknown> | null
  error: { code?: string; message: string } | null
} = { data: null, error: null }
const steamAccountInsertResult: {
  data: Record<string, unknown> | null
  error: { code?: string; message: string } | null
  throwError: Error | null
} = { data: null, error: null, throwError: null }

const supabaseMock = {
  from: (table: string) => {
    const builder: any = {
      // openBets duplicate-check chain (.select.eq.eq.is) resolves with
      // existingBetRows; the existing-bet branch only fires when the test
      // seeds at least one row.
      select: () => builder,
      insert: (values: Record<string, unknown>) => {
        supabaseInserts.push({ table, values })
        if (table === 'steam_accounts') {
          if (steamAccountInsertResult.throwError) {
            return Promise.reject(steamAccountInsertResult.throwError)
          }
          return Promise.resolve({ ...steamAccountInsertResult })
        }
        return Promise.resolve({ data: null, error: null })
      },
      update: (values: Record<string, unknown>) => {
        supabaseUpdates.push({ table, values })
        return builder
      },
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => builder,
      is: () => Promise.resolve({ data: existingBetRows.slice(), error: null }),
      neq: () => builder,
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: existingBetRows.slice(), error: null }),
      single: () => {
        if (table === 'matches') return Promise.resolve({ ...matchPredictionLookup })
        return Promise.resolve({ data: null, error: { message: 'not found' } })
      },
      maybeSingle: () => {
        if (table === 'steam_accounts') steamAccountSelectCalls.push(Date.now())
        return Promise.resolve({ ...steamAccountLookup })
      },
      match: () => Promise.resolve({ data: null, error: null }),
      then: (onF: any) => Promise.resolve({ data: existingBetRows.slice(), error: null }).then(onF),
    }
    return builder
  },
  rpc: async () => ({ data: [], error: null }),
}

const loggerMock = {
  info: (message: string, meta?: Record<string, unknown>) => {
    loggerInfoCalls.push({ message, meta })
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    loggerErrorCalls.push({ message, meta })
  },
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
  isPredictionAlreadyActiveError: (error: unknown) => {
    if (typeof error !== 'object' || error === null) return false
    const candidate = error as { statusCode?: unknown; body?: unknown }
    if (candidate.statusCode !== 400 || typeof candidate.body !== 'string') return false
    try {
      const body = JSON.parse(candidate.body) as { message?: unknown }
      return (
        typeof body.message === 'string' && body.message.includes('prediction event already active')
      )
    } catch {
      return false
    }
  },
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

vi.doMock('../../twitch/lib/closeTwitchBet', () => ({
  closeTwitchBet: async (...args: unknown[]) => {
    closeBetCalls.push(args)
  },
}))

vi.doMock('../say', () => ({
  say: (_client: unknown, message: string, options?: Record<string, unknown>) => {
    sayCalls.push({ message, options })
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
  return {
    ...real,
    getWL: async () => ({
      record: [{ lose: 2, type: 'R', win: 5 }],
      statsDays: 30,
    }),
  }
})

vi.doMock('../lib/ranks', async () => {
  const real = await vi.importActual<any>('../lib/ranks')
  return {
    ...real,
    getRankDetail: async () => null,
    getDotabodRankProfile: async () => null,
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
  json: {
    get: async () => null,
  },
}

const { server } = await import('../server')
server.setServer({
  io: {
    to: (token: string) => ({
      emit: (event: string, payload: unknown, ...trailingPayloads: unknown[]) => {
        ioEmitCalls.push({
          token,
          event,
          payload,
          ...(trailingPayloads.length > 0 ? { trailingPayloads } : {}),
        })
      },
    }),
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

function steam64(steam32Id: number) {
  return (76561197960265728n + BigInt(steam32Id)).toString()
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
    supabaseUpdates.length = 0
    steamAccountSelectCalls.length = 0
    loggerErrorCalls.length = 0
    loggerInfoCalls.length = 0
    openBetCalls.length = 0
    closeBetCalls.length = 0
    sayCalls.length = 0
    ioEmitCalls.length = 0
    heldTasks.length = 0
    removedTaskIds.length = 0
    existingBetRows.length = 0
    steamAccountLookup.data = null
    steamAccountLookup.error = null
    steamAccountInsertResult.data = null
    steamAccountInsertResult.error = null
    steamAccountInsertResult.throwError = null
    openTwitchBetControl.throwOnNextCall = null
    matchPredictionLookup.data = null
    matchPredictionLookup.error = null
    for (const k of Object.keys(redisStore)) delete redisStore[k]
  })

  afterEach(() => {
    vi.useRealTimers()
    supabaseInserts.length = 0
    openBetCalls.length = 0
    heldTasks.length = 0
    removedTaskIds.length = 0
    existingBetRows.length = 0
  })

  it('sends the configured stats window with WL overlay updates', async () => {
    const handler = makeHandler(makeClient())

    handler.emitWLUpdate()
    await vi.waitFor(() => {
      expect(ioEmitCalls).toContainEqual({
        token: 'token-arteezy',
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        trailingPayloads: [30],
      })
      expect(ioEmitCalls).toContainEqual({
        token: 'profile-wl:twitch-arteezy',
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        trailingPayloads: [30],
      })
    })
  })

  it('updates public profiles while offline without sending inactive overlay traffic', async () => {
    const handler = makeHandler(makeClient({ stream_online: false }))
    handler.client.stream_online = false

    handler.emitWLUpdate(true)

    await vi.waitFor(() => {
      expect(ioEmitCalls).toContainEqual({
        token: 'profile-wl:twitch-arteezy',
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        trailingPayloads: [30],
      })
    })
    expect(ioEmitCalls).not.toContainEqual(
      expect.objectContaining({ token: 'token-arteezy', event: 'update-wl' }),
    )
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

  it('keeps match history when openTwitchBet throws without announcing a prediction', async () => {
    // Match history is useful independently of Twitch predictions. A revoked
    // scope or transient Twitch 5xx must not erase a real streamed match, but
    // chat must also never be told that a prediction opened when it did not.
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)
    openTwitchBetControl.throwOnNextCall = new Error('ACTIVE_PREDICTION')

    await handler.openBets(handler.client)
    await heldTasks[0].invoke()

    expect(openBetCalls.length).toBe(1)
    expect(supabaseInserts).toContainEqual({
      table: 'matches',
      values: expect.objectContaining({
        matchId: '8825999999',
        predictionId: null,
      }),
    })
    expect(redisStore['token-arteezy:matchId']).toBe('8825999999')
    expect(sayCalls).toHaveLength(0)
    expect(handler.openingBets).toBe(false)
  })

  it('records an active-prediction conflict once and keeps the match guard without announcing bets', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)
    openTwitchBetControl.throwOnNextCall = Object.assign(new Error('Twitch API error'), {
      statusCode: 400,
      body: JSON.stringify({
        message: 'prediction event already active, only one allowed at a time',
      }),
    })

    await handler.openBets(handler.client)
    await heldTasks[0].invoke()

    expect(openBetCalls).toHaveLength(1)
    expect(supabaseInserts).toContainEqual({
      table: 'matches',
      values: expect.objectContaining({
        matchId: '8825999999',
        predictionId: null,
      }),
    })
    expect(redisStore['token-arteezy:matchId']).toBe('8825999999')
    expect(redisStore['token-arteezy:playingTeam']).toBe('radiant')
    expect(redisStore['token-arteezy:playingHero']).toBe('npc_dota_hero_nevermore')
    expect(sayCalls).toHaveLength(0)
    expect(loggerErrorCalls).toHaveLength(0)
    expect(loggerInfoCalls.filter((call) => call.meta?.event === 'open_bets')).toHaveLength(0)
    expect(
      loggerInfoCalls.filter(
        (call) => call.message === '[BETS] Twitch prediction already active; tracking match only',
      ),
    ).toHaveLength(1)

    await handler.openBets(handler.client)

    expect(openBetCalls).toHaveLength(1)
    expect(heldTasks).toHaveLength(1)
  })

  it('updates the match but skips Twitch closure when its predictionId is null', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8825999999',
          win_team: 'radiant',
          radiant_score: 42,
          dire_score: 31,
        },
        player: {
          accountid: 86745912,
          activity: 'playing',
          team_name: 'radiant',
          kills: 10,
          deaths: 2,
          assists: 15,
        },
      }),
    })
    const handler = makeHandler(client)
    redisStore['token-arteezy:matchId'] = '8825999999'
    redisStore['token-arteezy:playingTeam'] = 'radiant'
    redisStore['token-arteezy:playingHero'] = 'npc_dota_hero_nevermore'
    matchPredictionLookup.data = { predictionId: null }

    await handler.closeBets('radiant')

    expect(supabaseUpdates).toContainEqual({
      table: 'matches',
      values: expect.objectContaining({ won: true }),
    })
    expect(heldTasks).toHaveLength(1)

    await heldTasks[0].invoke()

    expect(closeBetCalls).toHaveLength(0)
    expect(redisStore['token-arteezy:matchId']).toBeUndefined()
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

  it('returns the overlay to the main screen and starts cleanup when a match reaches post-game', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8978976957',
          win_team: 'none',
          game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = 'playing'
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue(undefined)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(ioEmitCalls).toContainEqual({
      token: 'token-arteezy',
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_POST_GAME',
        team: 'radiant',
        type: null,
      },
    })
    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('keeps strategy time as an empty overlay state without starting match cleanup', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8978976957',
          win_team: 'none',
          game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = 'strategy-2'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue(undefined)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_STRATEGY_TIME')

    expect(ioEmitCalls).toContainEqual({
      token: 'token-arteezy',
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
        team: 'radiant',
        type: 'empty',
      },
    })
    expect(closeBets).not.toHaveBeenCalled()
  })

  it('starts post-game cleanup when the overlay reconnect reset the blocker cache', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8978976957',
          win_team: 'none',
          game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = undefined
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue(undefined)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('leaves an empty strategy state for the main screen when the match ends early', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8978976957',
          win_team: 'none',
          game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
        },
      }),
    })
    const handler = makeHandler(client)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_STRATEGY_TIME')
    ioEmitCalls.length = 0
    client.gsi.map.game_state = 'DOTA_GAMERULES_STATE_POST_GAME'
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue(undefined)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(ioEmitCalls).toContainEqual({
      token: 'token-arteezy',
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_POST_GAME',
        team: 'radiant',
        type: null,
      },
    })
    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('returns to the main screen and cleans up when GSI jumps from a match to init', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          matchid: '8978976957',
          win_team: 'none',
          game_state: 'DOTA_GAMERULES_STATE_INIT',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = undefined
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue(undefined)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_INIT')

    expect(ioEmitCalls).toContainEqual({
      token: 'token-arteezy',
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_INIT',
        team: 'radiant',
        type: null,
      },
    })
    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('invalidates the blocker cache during a forced stale-match reset', async () => {
    const handler = makeHandler(makeClient({ gsi: liveGsi() }))
    handler.blockCache = 'playing'

    await handler.resetClientState()

    expect(handler.blockCache).toBeUndefined()
  })
})

describe('updateSteam32Id — stale multi-account recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00.000Z'))
    supabaseInserts.length = 0
    steamAccountSelectCalls.length = 0
    loggerErrorCalls.length = 0
    steamAccountLookup.data = null
    steamAccountLookup.error = null
    steamAccountInsertResult.data = null
    steamAccountInsertResult.error = null
    steamAccountInsertResult.throwError = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeBlockedHandler(steam32Id = 440614454) {
    const client = makeClient({
      multiAccount: steam32Id,
      steam32Id: null,
      SteamAccount: [],
      gsi: liveGsi({ player: { steamid: steam64(steam32Id), name: 'Dota Account' } }),
    })
    return makeHandler(client)
  }

  it('does not query again within the 30-second conflict cooldown', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 29_999

    await handler.updateSteam32Id()

    expect(steamAccountSelectCalls).toHaveLength(0)
    expect(handler.client.multiAccount).toBe(440614454)
  })

  it('after 30 seconds creates the link when the Steam row is gone', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000

    await handler.updateSteam32Id()

    expect(steamAccountSelectCalls).toHaveLength(1)
    expect(supabaseInserts).toContainEqual({
      table: 'steam_accounts',
      values: expect.objectContaining({ steam32Id: 440614454, userId: 'token-arteezy' }),
    })
    expect(handler.client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(handler.client.steam32Id).toBe(440614454)
  })

  it('after 30 seconds restores the local account when ownership transferred to this user', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountLookup.data = {
      id: 'steam-row',
      userId: 'token-arteezy',
      mmr: 6123,
      connectedUserIds: [],
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(handler.client.steam32Id).toBe(440614454)
    expect(handler.client.mmr).toBe(6123)
    expect(handler.client.SteamAccount).toContainEqual(
      expect.objectContaining({ steam32Id: 440614454, mmr: 6123 }),
    )
    expect(supabaseInserts.filter((call) => call.table === 'steam_accounts')).toHaveLength(0)
  })

  it('retains a real conflict and restarts the cooldown', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountLookup.data = {
      id: 'steam-row',
      userId: 'different-user',
      mmr: 5000,
      connectedUserIds: [],
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(steamAccountSelectCalls).toHaveLength(1)

    await handler.updateSteam32Id()
    expect(steamAccountSelectCalls).toHaveLength(1)
  })

  it('on a transient Supabase error retains the conflict and never inserts', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountLookup.error = { code: '503', message: 'database unavailable' }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(supabaseInserts.filter((call) => call.table === 'steam_accounts')).toHaveLength(0)
    expect(loggerErrorCalls.some((call) => call.message === 'Error in updateSteam32Id')).toBe(true)
  })

  it('keeps the claimant blocked when recreating the missing Steam row fails', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountInsertResult.error = { code: '23505', message: 'duplicate key value' }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toEqual([])
    expect(loggerErrorCalls.some((call) => call.message === 'Error creating steam account')).toBe(
      true,
    )
  })

  it('blocks a first-time claimant when a uniqueness race rejects the Steam insert', async () => {
    const client = makeClient({
      multiAccount: undefined,
      steam32Id: null,
      SteamAccount: [],
      gsi: liveGsi({ player: { steamid: steam64(440614454), name: 'Dota Account' } }),
    })
    const handler = makeHandler(client)
    steamAccountInsertResult.error = { code: '23505', message: 'duplicate key value' }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toEqual([])
  })

  it('keeps a stale claimant blocked when the Steam insert throws', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountInsertResult.throwError = new Error('network unavailable')

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toEqual([])
  })

  it('blocks a first-time claimant when the Steam insert throws', async () => {
    const client = makeClient({
      multiAccount: undefined,
      steam32Id: null,
      SteamAccount: [],
      gsi: liveGsi({ player: { steamid: steam64(440614454), name: 'Dota Account' } }),
    })
    const handler = makeHandler(client)
    steamAccountInsertResult.throwError = new Error('network unavailable')

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toEqual([])
  })

  it('starts the cooldown when a conflict is newly assigned', async () => {
    const client = makeClient({
      multiAccount: undefined,
      steam32Id: null,
      SteamAccount: [],
      gsi: liveGsi({ player: { steamid: steam64(440614454), name: 'Dota Account' } }),
    })
    const handler = makeHandler(client)
    steamAccountLookup.data = {
      id: 'steam-row',
      userId: 'different-user',
      mmr: 5000,
      connectedUserIds: [],
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440614454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
  })
})
