import type { Database } from '@dotabod/shared-utils'
// Regression tests for the Arteezy stale-GSI bug: `openTheBet` used to read
// matchId + hero name from `client.gsi` at delay-fire time, which can be
// cleared (player abandoned + requeued) between `openBets()` validating and
// `openTheBet()` running. The fix captures both values at validation time and
// passes them through the delayed callback closure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  buildSharedUtilsMock,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
  PRO_SUB,
} from '../../__tests__/shared-mocks'
import type { Packet, SocketClient } from '../../types'
import type { say } from '../say'

type SharedUtilsMockOptions = Parameters<typeof buildSharedUtilsMock>[0]
type LoggerMetadata = NonNullable<Parameters<SharedUtilsMockOptions['logger']['info']>[1]>
type SayOptions = Parameters<typeof say>[2]
type MatchInsert = Database['public']['Tables']['matches']['Insert']
type SteamAccountInsert = Database['public']['Tables']['steam_accounts']['Insert']
type MatchUpdate = Database['public']['Tables']['matches']['Update']
type SteamAccountUpdate = Database['public']['Tables']['steam_accounts']['Update']
type UserUpdate = Database['public']['Tables']['users']['Update']
type CapturedInsertValues = Partial<MatchInsert & SteamAccountInsert>
type CapturedUpdateValues = Partial<MatchUpdate & SteamAccountUpdate & UserUpdate>

interface SupabaseError {
  code?: string
  message: string
}

interface ExistingBetRow {
  id: string
  matchId: string
  myTeam: string
}

interface SteamAccountRecord {
  connectedUserIds: string[] | null
  id: string
  mmr: number
  userId: string
}

interface OpenTwitchBetControl {
  throwOnNextCall: Error | null
}

interface TwitchApiError extends Error {
  body?: string
  statusCode?: number
}

const twitchApiErrorBodySchema = z.object({ message: z.string().optional() })

interface MatchPredictionLookup {
  data: { predictionId: string | null } | null
  error: SupabaseError | null
}

interface SteamAccountLookup {
  data: SteamAccountRecord | null
  error: SupabaseError | null
}

interface SteamAccountInsertResult {
  data: SteamAccountRecord | null
  error: SupabaseError | null
  throwError: Error | null
}

interface BetRowsResult {
  data: ExistingBetRow[]
  error: null
}

type LiveGsiPlayerOverrides = Omit<Partial<NonNullable<Packet['player']>>, 'accountid'> & {
  accountid?: number | string
}

interface LiveGsiOverrides {
  hero?: Partial<NonNullable<Packet['hero']>>
  map?: Partial<NonNullable<Packet['map']>>
  player?: LiveGsiPlayerOverrides
}

interface InsertCall {
  table: string
  values: CapturedInsertValues
}
interface UpdateCall {
  table: string
  values: CapturedUpdateValues
}
interface OpenBetCall {
  heroName: string | undefined
  matchidAtCallTime: string | undefined
}
interface DelayedTask {
  id: string
  delayMs: number
  invoke: () => void | Promise<void>
  cancelled: boolean
}

const supabaseInserts: InsertCall[] = []
const supabaseUpdates: UpdateCall[] = []
const steamAccountSelectCalls: number[] = []
const loggerErrorCalls: { message: string; meta?: LoggerMetadata }[] = []
const loggerInfoCalls: { message: string; meta?: LoggerMetadata }[] = []
const openBetCalls: OpenBetCall[] = []
const closeBetCalls: unknown[][] = []
const sayCalls: { message: string; options?: SayOptions }[] = []
const ioEmitCalls: {
  token: string
  event: string
  payload: unknown
  trailingPayloads?: unknown[]
}[] = []
const heldTasks: DelayedTask[] = []
const removedTaskIds: string[] = []
const openTwitchBetControl: OpenTwitchBetControl = { throwOnNextCall: null }
const matchPredictionLookup: MatchPredictionLookup = { data: null, error: null }
// Existing rows the supabase mock returns from a `.select(...).eq.eq.is(...)`
// chain (the openBets duplicate-bet check at line 712-718). Default: empty.
const existingBetRows: ExistingBetRow[] = []
const steamAccountLookup: SteamAccountLookup = { data: null, error: null }
const steamAccountInsertResult: SteamAccountInsertResult = {
  data: null,
  error: null,
  throwError: null,
}

interface SupabaseBuilder {
  eq: () => SupabaseBuilder
  gte: () => SupabaseBuilder
  insert: (values: CapturedInsertValues) => Promise<SteamAccountInsertResult>
  is: () => Promise<BetRowsResult>
  limit: () => Promise<BetRowsResult>
  match: () => Promise<{ data: null; error: null }>
  maybeSingle: () => Promise<typeof steamAccountLookup>
  neq: () => SupabaseBuilder
  not: () => SupabaseBuilder
  order: () => SupabaseBuilder
  select: () => SupabaseBuilder
  single: () => Promise<typeof matchPredictionLookup | { data: null; error: { message: string } }>
  then: (onFulfilled: (value: BetRowsResult) => BetRowsResult) => Promise<BetRowsResult>
  update: (values: CapturedUpdateValues) => SupabaseBuilder
  upsert: () => Promise<{ data: null; error: null }>
}

const supabaseMock = {
  from: (table: string) => {
    const builder: SupabaseBuilder = {
      // openBets duplicate-check chain (.select.eq.eq.is) resolves with
      // existingBetRows; the existing-bet branch only fires when the test
      // seeds at least one row.
      select: () => builder,
      insert: async (values: CapturedInsertValues) => {
        supabaseInserts.push({ table, values })
        if (table === 'steam_accounts') {
          if (steamAccountInsertResult.throwError) {
            return await Promise.reject(steamAccountInsertResult.throwError)
          }
          return await Promise.resolve({ ...steamAccountInsertResult })
        }
        return await Promise.resolve({ data: null, error: null, throwError: null })
      },
      update: (values: CapturedUpdateValues) => {
        supabaseUpdates.push({ table, values })
        return builder
      },
      upsert: async () => await Promise.resolve({ data: null, error: null }),
      eq: () => builder,
      is: async () => await Promise.resolve({ data: [...existingBetRows], error: null }),
      neq: () => builder,
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: async () => await Promise.resolve({ data: [...existingBetRows], error: null }),
      single: async () => {
        if (table === 'matches') {
          return await Promise.resolve({ ...matchPredictionLookup })
        }
        return await Promise.resolve({ data: null, error: { message: 'not found' } })
      },
      maybeSingle: async () => {
        if (table === 'steam_accounts') {
          steamAccountSelectCalls.push(Date.now())
        }
        return await Promise.resolve({ ...steamAccountLookup })
      },
      match: async () => await Promise.resolve({ data: null, error: null }),
      then: async (onFulfilled) =>
        await Promise.resolve({ data: [...existingBetRows], error: null }).then(onFulfilled),
    }
    return builder
  },
  rpc: async () => await Promise.resolve({ data: [], error: null }),
}

const loggerMock = {
  debug: () => {},
  error: (message: string, meta?: LoggerMetadata) => {
    loggerErrorCalls.push({ message, meta })
  },
  info: (message: string, meta?: LoggerMetadata) => {
    loggerInfoCalls.push({ message, meta })
  },
  warn: () => {},
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ logger: loggerMock, supabase: supabaseMock })
)

vi.doMock('../../steam/ws', () => ({
  steamSocket: { emit: () => {}, on: () => {} },
  twitchChat: { emit: () => {}, on: () => {} },
  twitchEvents: { emit: () => {}, on: () => {} },
}))

vi.doMock('../../twitch/lib/open-twitch-bet', () => ({
  isPredictionAlreadyActiveError: (error: TwitchApiError) => {
    if (error.statusCode !== 400 || error.body === undefined) {
      return false
    }
    try {
      const body = twitchApiErrorBodySchema.parse(JSON.parse(error.body))
      return body.message?.includes('prediction event already active') === true
    } catch {
      return false
    }
  },
  openTwitchBet: async ({ heroName, client }: { heroName?: string; client: SocketClient }) => {
    openBetCalls.push({
      heroName,
      matchidAtCallTime: client?.gsi?.map?.matchid,
    })
    if (openTwitchBetControl.throwOnNextCall) {
      const e = openTwitchBetControl.throwOnNextCall
      openTwitchBetControl.throwOnNextCall = null
      return await Promise.reject(e)
    }
    return await Promise.resolve({ id: 'bet-id-1' })
  },
}))

vi.doMock('../../twitch/lib/close-twitch-bet', () => ({
  closeTwitchBet: async (...args: unknown[]) => {
    closeBetCalls.push(args)
    await Promise.resolve()
  },
}))

vi.doMock('../say', () => ({
  say: (_client: SocketClient, message: string, options?: SayOptions) => {
    sayCalls.push({ message, options })
  },
}))

vi.doMock('../lib/delayed-queue', () => ({
  delayedQueue: {
    addTask: (
      delayMs: number,
      cb: (payload: unknown) => void | Promise<void>,
      payload?: unknown
    ) => {
      const id = `task-${heldTasks.length + 1}`
      const task: DelayedTask = {
        cancelled: false,
        delayMs,
        id,
        invoke: async () => {
          if (task.cancelled) {
            return
          }
          await cb(payload)
        },
      }
      heldTasks.push(task)
      return id
    },
    removeTask: (id: string) => {
      removedTaskIds.push(id)
      const task = heldTasks.find((t) => t.id === id)
      if (task) {
        task.cancelled = true
      }
      return !!task
    },
  },
}))

// Avoid network/socket side effects from emitBadgeUpdate / emitWLUpdate. We
// bypass these by constructing with stream_online=false so the ctor early-
// returns, but the modules are still imported at file-load time so they
// need to load cleanly.
vi.doMock('../../db/get-wl', async () => {
  const real = await vi.importActual<typeof import('../../db/get-wl')>('../../db/get-wl')
  return {
    ...real,
    getWL: async () =>
      await Promise.resolve({
        record: [{ lose: 2, type: 'R', win: 5 }],
        statsDays: 14,
        statsDaysTotal: 30,
      }),
  }
})

vi.doMock(import('../lib/ranks'), async () => {
  const real = await vi.importActual<typeof import('../lib/ranks')>('../lib/ranks')
  return {
    ...real,
    getDotabodRankProfile: async () => await Promise.resolve(null),
    getRankDescription: async () => await Promise.resolve(null),
    getRankDetail: async () => await Promise.resolve(null),
    getRankTitle: () => 'Immortal',
  }
})

await initTestI18n()

const { redisClient } = await import('../../db/redis-instance')
const redisStore: Record<string, string> = {}
interface RedisMultiChain {
  del: (key: string) => RedisMultiChain
  exec: () => Promise<never[]>
}

Object.assign(redisClient, {
  client: {
    del: async (key: string) => {
      delete redisStore[key]
      return await Promise.resolve(1)
    },
    get: async (key: string) => await Promise.resolve(redisStore[key] ?? null),
    json: {
      get: async () => await Promise.resolve(null),
    },
    multi: () => {
      const ops: (() => void)[] = []
      const chain: RedisMultiChain = {
        del: (key: string) => {
          ops.push(() => {
            delete redisStore[key]
          })
          return chain
        },
        exec: async () => {
          ops.forEach((op) => {
            op()
          })
          return await Promise.resolve([])
        },
      }
      return chain
    },
    set: async (key: string, val: string) => {
      redisStore[key] = val
      return await Promise.resolve('OK')
    },
    setEx: async (key: string, _ttl: number, val: string) => {
      redisStore[key] = val
      return await Promise.resolve('OK')
    },
  },
})

const { server } = await import('../server')
server.setServer({
  io: {
    fetchSockets: async () => await Promise.resolve([]),
    to: (token: string) => ({
      emit: (event: string, payload: unknown, ...trailingPayloads: unknown[]) => {
        ioEmitCalls.push({
          event,
          payload,
          token,
          ...(trailingPayloads.length > 0 ? { trailingPayloads } : {}),
        })
      },
    }),
  },
})

// Side-effect import: registers the GSIHandler constructor with the factory.
await import('../gsi-handler')
const { createGSIHandler } = await import('../gsi-handler-factory')

type Client = SocketClient

const makeClient = function makeClient(overrides: Partial<Client> = {}): Client {
  return createSocketClientStub({
    Account: {
      access_token: '',
      expires_at: null,
      expires_in: null,
      obtainment_timestamp: null,
      providerAccountId: 'twitch-arteezy',
      refresh_token: '',
      requires_refresh: false,
      scope: null,
    },
    gsi: undefined,
    locale: 'en',
    mmr: 12_000,
    name: 'arteezy',
    settings: [],
    steam32Id: 86_745_912,
    // ctor early-returns; we re-enable after construction
    stream_online: false,
    subscription: PRO_SUB,
    token: 'token-arteezy',
    ...overrides,
  })
}

const liveGsi = function liveGsi(overrides: LiveGsiOverrides = {}) {
  return createPacketStub({
    hero: { name: 'npc_dota_hero_nevermore' },
    map: { clock_time: 0, game_time: 0, matchid: '8825999999', win_team: 'none' },
    player: { activity: 'playing', team_name: 'radiant' },
    ...overrides,
  })
}

const steam64 = function steam64(steam32Id: number) {
  return (76_561_197_960_265_728n + BigInt(steam32Id)).toString()
}

const makeHandler = function makeHandler(client: Client) {
  const handler = createGSIHandler(client)
  // ctor disabled the handler because stream_online was false; flip both
  // flags so openBets proceeds as if the streamer is live.
  handler.client.stream_online = true
  handler.disabled = false
  return handler
}

const requireGsi = function requireGsi(client: Client) {
  if (!client.gsi) {
    throw new Error('Expected test client to have GSI data')
  }
  return client.gsi
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
    for (const k of Object.keys(redisStore)) {
      delete redisStore[k]
    }
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
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        token: 'token-arteezy',
        trailingPayloads: [14, 30],
      })
      expect(ioEmitCalls).toContainEqual({
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        token: 'profile-wl:twitch-arteezy',
        trailingPayloads: [14, 30],
      })
    })
  })

  it('updates public profiles while offline without sending inactive overlay traffic', async () => {
    const handler = makeHandler(makeClient({ stream_online: false }))
    handler.client.stream_online = false

    handler.emitWLUpdate(true)

    await vi.waitFor(() => {
      expect(ioEmitCalls).toContainEqual({
        event: 'update-wl',
        payload: [{ lose: 2, type: 'R', win: 5 }],
        token: 'profile-wl:twitch-arteezy',
        trailingPayloads: [14, 30],
      })
    })
    expect(ioEmitCalls).not.toContainEqual(
      expect.objectContaining({ event: 'update-wl', token: 'token-arteezy' })
    )
  })

  it('uses the matchId + hero captured at openBets time, even when GSI clears before the delayed openTheBet fires', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)

    expect(heldTasks).toHaveLength(1)

    // Simulate the Arteezy scenario: between openBets and the delayed callback,
    // the game abandons and GSI clears (or a new game has begun and reset
    // wiped state). The captured matchId/hero must still flow through.
    const gsi = requireGsi(handler.client)
    gsi.map = undefined
    gsi.hero = undefined

    await heldTasks[0].invoke()

    expect(supabaseInserts).toHaveLength(1)
    const insert = supabaseInserts[0]
    expect(insert.table).toBe('matches')
    expect(insert.values.matchId).toBe('8825999999')
    expect(insert.values.hero_name).toBe('npc_dota_hero_nevermore')
    expect(insert.values.predictionId).toBe('bet-id-1')

    expect(openBetCalls).toHaveLength(1)
    expect(openBetCalls[0].heroName).toBe('Shadow Fiend')
  })

  it('does not insert a matches row or open a twitch prediction when openTheBet is invoked with no matchId', async () => {
    const client = makeClient({ gsi: liveGsi() })
    const handler = makeHandler(client)

    await handler.openTheBet('', '')

    expect(supabaseInserts).toHaveLength(0)
    expect(openBetCalls).toHaveLength(0)
    expect(handler.openingBets).toBeFalsy()
  })

  it('inserts with the valid matchId, hero, and predictionId on the happy path', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825339220', win_team: 'none' } }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    expect(heldTasks).toHaveLength(1)

    await heldTasks[0].invoke()

    expect(supabaseInserts).toHaveLength(1)
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

    expect(heldTasks).toHaveLength(0)
    expect(handler.openingBets).toBeFalsy()
  })

  it('cleans up Redis matchId/playingTeam/playingHero when openTheBet bails without inserting a row', async () => {
    // Code-review finding: openBets writes 3 Redis keys before queueing
    // openTheBet. If openTheBet later bails (unrecognized hero, twitch
    // failure, empty-arg defense), the keys are orphaned — closeBets reads
    // ${token}:matchId, finds the matchId, updates zero matches rows
    // silently, and checkEarlyDCWinner's .single() then errors out.
    const client = makeClient({
      gsi: liveGsi({
        hero: { name: 'npc_dota_hero_does_not_exist' },
        map: { matchid: '8825999999', win_team: 'none' },
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
        hero: { name: 'npc_dota_hero_does_not_exist' },
        map: { matchid: '8825999999', win_team: 'none' },
      }),
    })
    const handler = makeHandler(client)

    await handler.openBets(handler.client)
    await heldTasks[0].invoke()

    expect(openBetCalls).toHaveLength(0)
    expect(supabaseInserts).toHaveLength(0)
    expect(handler.openingBets).toBeFalsy()
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

    expect(openBetCalls).toHaveLength(1)
    expect(supabaseInserts).toContainEqual({
      table: 'matches',
      values: expect.objectContaining({
        matchId: '8825999999',
        predictionId: null,
      }),
    })
    expect(redisStore['token-arteezy:matchId']).toBe('8825999999')
    expect(sayCalls).toHaveLength(0)
    expect(handler.openingBets).toBeFalsy()
  })

  it('records an active-prediction conflict once and keeps the match guard without announcing bets', async () => {
    const client = makeClient({
      gsi: liveGsi({ map: { matchid: '8825999999', win_team: 'none' } }),
    })
    const handler = makeHandler(client)
    openTwitchBetControl.throwOnNextCall = Object.assign(new Error('Twitch API error'), {
      body: JSON.stringify({
        message: 'prediction event already active, only one allowed at a time',
      }),
      statusCode: 400,
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
        (call) => call.message === '[BETS] Twitch prediction already active; tracking match only'
      )
    ).toHaveLength(1)

    await handler.openBets(handler.client)

    expect(openBetCalls).toHaveLength(1)
    expect(heldTasks).toHaveLength(1)
  })

  it('updates the match but skips Twitch closure when its predictionId is null', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          dire_score: 31,
          matchid: '8825999999',
          radiant_score: 42,
          win_team: 'radiant',
        },
        player: {
          accountid: 86_745_912,
          activity: 'playing',
          assists: 15,
          deaths: 2,
          kills: 10,
          team_name: 'radiant',
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
    expect(heldTasks).toHaveLength(1)

    const gsi = requireGsi(handler.client)
    gsi.player = undefined
    gsi.map = undefined
    gsi.hero = undefined

    await heldTasks[0].invoke()

    expect(supabaseInserts).toHaveLength(1)
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
    expect(heldTasks).toHaveLength(1)
    const queuedTaskId = heldTasks[0].id

    // Match ends abruptly (close + reset, or early-DC handler reset).
    await handler.resetClientState()

    // The task must have been removed from the queue; firing it should be a no-op.
    expect(removedTaskIds).toContain(queuedTaskId)
    expect(heldTasks[0].cancelled).toBeTruthy()

    await heldTasks[0].invoke()
    expect(supabaseInserts).toHaveLength(0)
    expect(openBetCalls).toHaveLength(0)
  })

  it('returns the overlay to the main screen and starts cleanup when a match reaches post-game', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
          matchid: '8978976957',
          win_team: 'none',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = 'playing'
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue()

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(ioEmitCalls).toContainEqual({
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_POST_GAME',
        team: 'radiant',
        type: null,
      },
      token: 'token-arteezy',
    })
    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('keeps strategy time as an empty overlay state without starting match cleanup', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
          matchid: '8978976957',
          win_team: 'none',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = 'strategy-2'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue()

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_STRATEGY_TIME')

    expect(ioEmitCalls).toContainEqual({
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
        team: 'radiant',
        type: 'empty',
      },
      token: 'token-arteezy',
    })
    expect(closeBets).not.toHaveBeenCalled()
  })

  it('starts post-game cleanup when the overlay reconnect reset the blocker cache', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_POST_GAME',
          matchid: '8978976957',
          win_team: 'none',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = undefined
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue()

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('leaves an empty strategy state for the main screen when the match ends early', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
          matchid: '8978976957',
          win_team: 'none',
        },
      }),
    })
    const handler = makeHandler(client)

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_STRATEGY_TIME')
    ioEmitCalls.length = 0
    const map = requireGsi(client).map
    if (!map) {
      throw new Error('Expected test client to have GSI map data')
    }
    map.game_state = 'DOTA_GAMERULES_STATE_POST_GAME'
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue()

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_POST_GAME')

    expect(ioEmitCalls).toContainEqual({
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_POST_GAME',
        team: 'radiant',
        type: null,
      },
      token: 'token-arteezy',
    })
    expect(closeBets).toHaveBeenCalledOnce()
  })

  it('returns to the main screen and cleans up when GSI jumps from a match to init', async () => {
    const client = makeClient({
      gsi: liveGsi({
        map: {
          game_state: 'DOTA_GAMERULES_STATE_INIT',
          matchid: '8978976957',
          win_team: 'none',
        },
      }),
    })
    const handler = makeHandler(client)
    handler.blockCache = undefined
    redisStore['token-arteezy:matchId'] = '8978976957'
    const closeBets = vi.spyOn(handler, 'closeBets').mockResolvedValue()

    await handler.setupOBSBlockers('DOTA_GAMERULES_STATE_INIT')

    expect(ioEmitCalls).toContainEqual({
      event: 'block',
      payload: {
        matchId: '8978976957',
        state: 'DOTA_GAMERULES_STATE_INIT',
        team: 'radiant',
        type: null,
      },
      token: 'token-arteezy',
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

  const makeBlockedHandler = function makeBlockedHandler(steam32Id = 440_614_454) {
    const client = makeClient({
      SteamAccount: [],
      gsi: liveGsi({ player: { name: 'Dota Account', steamid: steam64(steam32Id) } }),
      multiAccount: steam32Id,
      steam32Id: null,
    })
    return makeHandler(client)
  }

  it('does not query again within the 30-second conflict cooldown', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 29_999

    await handler.updateSteam32Id()

    expect(steamAccountSelectCalls).toHaveLength(0)
    expect(handler.client.multiAccount).toBe(440_614_454)
  })

  it('after 30 seconds creates the link when the Steam row is gone', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000

    await handler.updateSteam32Id()

    expect(steamAccountSelectCalls).toHaveLength(1)
    expect(supabaseInserts).toContainEqual({
      table: 'steam_accounts',
      values: expect.objectContaining({ steam32Id: 440_614_454, userId: 'token-arteezy' }),
    })
    expect(handler.client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(handler.client.steam32Id).toBe(440_614_454)
  })

  it('after 30 seconds restores the local account when ownership transferred to this user', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountLookup.data = {
      connectedUserIds: [],
      id: 'steam-row',
      mmr: 6123,
      userId: 'token-arteezy',
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(handler.client.steam32Id).toBe(440_614_454)
    expect(handler.client.mmr).toBe(6123)
    expect(handler.client.SteamAccount).toContainEqual(
      expect.objectContaining({ mmr: 6123, steam32Id: 440_614_454 })
    )
    expect(supabaseInserts.filter((call) => call.table === 'steam_accounts')).toHaveLength(0)
  })

  it('retains a real conflict and restarts the cooldown', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountLookup.data = {
      connectedUserIds: [],
      id: 'steam-row',
      mmr: 5000,
      userId: 'different-user',
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
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

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(supabaseInserts.filter((call) => call.table === 'steam_accounts')).toHaveLength(0)
    expect(
      loggerErrorCalls.some((call) => call.message === 'Error in updateSteam32Id')
    ).toBeTruthy()
  })

  it('keeps the claimant blocked when recreating the missing Steam row fails', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountInsertResult.error = { code: '23505', message: 'duplicate key value' }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toStrictEqual([])
    expect(
      loggerErrorCalls.some((call) => call.message === 'Error creating steam account')
    ).toBeTruthy()
  })

  it('blocks a first-time claimant when a uniqueness race rejects the Steam insert', async () => {
    const client = makeClient({
      SteamAccount: [],
      gsi: liveGsi({ player: { name: 'Dota Account', steamid: steam64(440_614_454) } }),
      multiAccount: undefined,
      steam32Id: null,
    })
    const handler = makeHandler(client)
    steamAccountInsertResult.error = { code: '23505', message: 'duplicate key value' }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toStrictEqual([])
  })

  it('keeps a stale claimant blocked when the Steam insert throws', async () => {
    const handler = makeBlockedHandler()
    handler.multiAccountRevalidatedAt = Date.now() - 30_000
    steamAccountInsertResult.throwError = new Error('network unavailable')

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toStrictEqual([])
  })

  it('blocks a first-time claimant when the Steam insert throws', async () => {
    const client = makeClient({
      SteamAccount: [],
      gsi: liveGsi({ player: { name: 'Dota Account', steamid: steam64(440_614_454) } }),
      multiAccount: undefined,
      steam32Id: null,
    })
    const handler = makeHandler(client)
    steamAccountInsertResult.throwError = new Error('network unavailable')

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
    expect(handler.client.steam32Id).toBeNull()
    expect(handler.client.SteamAccount).toStrictEqual([])
  })

  it('starts the cooldown when a conflict is newly assigned', async () => {
    const client = makeClient({
      SteamAccount: [],
      gsi: liveGsi({ player: { name: 'Dota Account', steamid: steam64(440_614_454) } }),
      multiAccount: undefined,
      steam32Id: null,
    })
    const handler = makeHandler(client)
    steamAccountLookup.data = {
      connectedUserIds: [],
      id: 'steam-row',
      mmr: 5000,
      userId: 'different-user',
    }

    await handler.updateSteam32Id()

    expect(handler.client.multiAccount).toBe(440_614_454)
    expect(handler.multiAccountRevalidatedAt).toBe(Date.now())
  })
})
