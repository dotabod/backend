// Shared test harness for twitch-events. Filename is intentionally NOT
// `.test.ts` so bun's runner ignores it.
//
// Why this exists: bun's `vi.doMock()` is process-wide. Every test file that
// needs `@dotabod/shared-utils` (or the sibling modules below) mocked must go
// through this single harness, otherwise competing factories for the same
// module spec collide when the whole suite runs together (passes in isolation,
// fails together). Import the SUTs from here, not from their real paths.
import { vi } from 'vitest'

import type { TwitchEventSubResponse } from '../interfaces.ts'
import type { TwitchEventTypes } from '../twitch-event-types.ts'

export type TestValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Error
  | TestValue[]
  | { [key: string]: TestValue }
export interface TestRecord {
  [key: string]: TestValue
}

interface LogCall {
  message: string
  meta: TestRecord
}
interface SubscribeCall {
  conduitId: string
  userId: string
  type: keyof TwitchEventTypes
}

interface TestState {
  conduitId: string
  isBanned: boolean
  accountIds: string[]
  // Per-(userId,type) subscribe result; default true. Throw by setting an Error.
  subscribeResult: (userId: string, type: keyof TwitchEventTypes) => boolean | Promise<boolean>
  subscribeCalls: SubscribeCall[]
  logInfo: LogCall[]
  logWarn: LogCall[]
  logError: LogCall[]
  // supabase: accounts.single() -> dbUser; settings.select -> dbSettings;
  // upserts/updates capture writes.
  dbUser: { userId: string } | null
  dbSettings: { key: string; value: TestValue }[]
  upserts: { table: string; values: TestRecord }[]
  updates: { table: string; values: TestRecord }[]
  commandDisableCalls: (
    | { kind: 'disable'; userId: string; reason: string; metadata?: TestRecord }
    | { kind: 'enable'; userId: string; opts?: { reason?: string; autoResolved?: boolean } }
  )[]
  // botApi (handleNewUser) + getTwitchAPI moderation (ensureBotIsModerator).
  stream: { startDate: Date } | null
  streamer: { displayName: string; name: string } | null
  addModeratorError: Error | { _body: string } | null
  addModeratorCalls: string[]
  // Supabase Realtime channel handlers registered by the watcher. Keyed by
  // "{event}:{table}" e.g. "INSERT:accounts". Tests fire them to simulate
  // postgres_changes events without a real Realtime connection.
  channelHandlers: Map<
    string,
    (payload: { new?: TestRecord; old?: TestRecord }) => TestValue | Promise<TestValue>
  >
  channelSubscribeStatuses: string[]
  // Callbacks passed to `.subscribe()`. Tests fire them with a non-SUBSCRIBED
  // status (CHANNEL_ERROR/CLOSED/TIMED_OUT) to drive the reconnect path.
  channelSubscribeCallbacks: ((status: string, err?: Error) => void)[]
  // Bumped each time the watcher calls `supabase.channel(...)`. Starts at 0;
  // setupAccountWatcher() bumps to 1, each reconnect bumps further.
  channelCreationCount: number
  watcherOperations: Promise<void>[]
  // Bumped each time the watcher calls `supabase.removeChannel(...)`.
  removeChannelCount: number
  // When true, removeChannel() synchronously re-fires the most-recent
  // subscribe callback with 'CLOSED' — replicating real supabase-js, which
  // tears the channel down on the same stack and re-emits CLOSED. Off by
  // default so the other reconnect tests keep their simple semantics; the
  // re-entrancy regression test flips it on.
  removeChannelRefiresClosed: boolean
  // If non-empty, sbBuilder.single() on the `accounts` table shifts the next
  // entry off this queue. Lets tests script per-call lookup behavior (e.g.
  // first lookup returns null, second returns a row) and inject transient DB
  // errors. Each entry's `data` shape depends on which call site you're
  // mocking — `findUserIdByProviderAccount` selects `userId`, the watcher's
  // UPDATE:users handler selects `providerAccountId`. Falls back to `dbUser`
  // (with error: null) when the queue is empty.
  accountsLookupResults: { data: TestRecord | null; error: Error | null }[]
  // Same shape as accountsLookupResults but consumed by `users.single()` calls
  // (e.g. handleNewUser's ban check). Falls back to `{ data: null, error: null }`
  // — benign for tests that don't care about ban status.
  usersLookupResults: { data: TestRecord | null; error: Error | null }[]
  // When set, botApi.streams.getStreamByUserId throws this error. Lets tests
  // verify the handleNewUser path continues into subscription registration
  // even when the Twitch profile-fetch step fails.
  streamError: Error | null
  // If set, supabase.channel() throws this error synchronously. Used to
  // exercise the watcher's "channel-creation threw" reconnect path.
  channelCreationError: Error | null
  // If set, the realtime channel's `.on(...)` throws this error on the FIRST
  // call. Used to exercise the watcher's "channel setup threw" reconnect path.
  channelOnError: Error | null
}

export const state: TestState = {
  accountIds: [],
  accountsLookupResults: [],
  addModeratorCalls: [],
  addModeratorError: null,
  channelCreationCount: 0,
  channelCreationError: null,
  channelHandlers: new Map(),
  channelOnError: null,
  channelSubscribeCallbacks: [],
  channelSubscribeStatuses: [],
  commandDisableCalls: [],
  conduitId: 'conduit-1',
  dbSettings: [],
  dbUser: { userId: 'user-1' },
  isBanned: false,
  logError: [],
  logInfo: [],
  logWarn: [],
  removeChannelCount: 0,
  removeChannelRefiresClosed: false,
  stream: null,
  streamError: null,
  streamer: { displayName: 'Streamer', name: 'streamer' },
  subscribeCalls: [],
  subscribeResult: () => true,
  updates: [],
  upserts: [],
  usersLookupResults: [],
  watcherOperations: [],
}

export const resetState = function resetState() {
  state.conduitId = 'conduit-1'
  state.isBanned = false
  state.accountIds = []
  state.subscribeResult = () => true
  state.subscribeCalls = []
  state.logInfo = []
  state.logWarn = []
  state.logError = []
  state.dbUser = { userId: 'user-1' }
  state.dbSettings = []
  state.upserts = []
  state.updates = []
  state.commandDisableCalls = []
  state.stream = null
  state.streamer = { displayName: 'Streamer', name: 'streamer' }
  state.addModeratorError = null
  state.addModeratorCalls = []
  state.channelHandlers = new Map()
  state.channelSubscribeStatuses = []
  state.channelSubscribeCallbacks = []
  state.channelCreationCount = 0
  state.watcherOperations = []
  state.removeChannelCount = 0
  state.removeChannelRefiresClosed = false
  state.accountsLookupResults = []
  state.usersLookupResults = []
  state.streamError = null
  state.channelCreationError = null
  state.channelOnError = null
}

// Chainable supabase mock. accounts...single() -> dbUser; settings select ->
// dbSettings; update/upsert/delete are captured / resolve.
interface SbBuilder {
  select: () => SbBuilder
  update: (v: TestRecord) => SbBuilder
  delete: () => SbBuilder
  upsert: (v: TestRecord) => Promise<{ data: null; error: null }>
  eq: () => SbBuilder
  single: () => Promise<{ data: TestRecord | null; error: Error | null }>
  then: (onFulfilled: (v: { data: TestRecord[] | null; error: null }) => TestValue) => TestValue
}

const sbBuilder = function sbBuilder(table: string) {
  let mode: 'select' | 'update' | 'delete' = 'select'
  let values: TestRecord = {}
  const b: SbBuilder = {
    delete: () => {
      mode = 'delete'
      return b
    },
    eq: () => b,
    select: () => b,
    single: async () => {
      if (table === 'accounts') {
        if (state.accountsLookupResults.length > 0) {
          const scriptedResult = state.accountsLookupResults.shift()
          if (scriptedResult !== undefined) {
            return await Promise.resolve(scriptedResult)
          }
        }
        return await Promise.resolve({ data: state.dbUser, error: null })
      }
      if (table === 'users') {
        if (state.usersLookupResults.length > 0) {
          const scriptedResult = state.usersLookupResults.shift()
          if (scriptedResult !== undefined) {
            return await Promise.resolve(scriptedResult)
          }
        }
        return await Promise.resolve({ data: null, error: null })
      }
      return await Promise.resolve({ data: null, error: null })
    },
    then: (onFulfilled) => {
      if (mode === 'update') {
        state.updates.push({ table, values })
      }
      const data = mode === 'select' && table === 'settings' ? state.dbSettings : null
      return onFulfilled({ data, error: null })
    },
    update: (v: TestRecord) => {
      mode = 'update'
      values = v
      return b
    },
    upsert: async (v: TestRecord) => {
      state.upserts.push({ table, values: v })
      return await Promise.resolve({ data: null, error: null })
    },
  }
  return b
}
interface RealtimeChannelMock {
  on: (
    type: string,
    opts: { event: string; schema: string; table: string },
    handler: (payload: { new?: TestRecord; old?: TestRecord }) => TestValue | Promise<TestValue>
  ) => RealtimeChannelMock
  subscribe: (cb?: (status: string, err?: Error) => void) => RealtimeChannelMock
}

const realtimeChannelMock = function realtimeChannelMock(): RealtimeChannelMock {
  let onCallsSoFar = 0
  const channel: RealtimeChannelMock = {
    on: (_type, opts, handler) => {
      if (state.channelOnError && onCallsSoFar === 0) {
        onCallsSoFar += 1
        throw state.channelOnError
      }
      onCallsSoFar += 1
      state.channelHandlers.set(`${opts.event}:${opts.table}`, handler)
      return channel
    },
    subscribe: (cb) => {
      state.channelSubscribeStatuses.push('SUBSCRIBED')
      if (cb) {
        state.channelSubscribeCallbacks.push(cb)
      }
      cb?.('SUBSCRIBED')
      return channel
    },
  }
  return channel
}

const supabaseMock = {
  channel: () => {
    state.channelCreationCount += 1
    if (state.channelCreationError) {
      throw state.channelCreationError
    }
    return realtimeChannelMock()
  },
  from: (table: string) => sbBuilder(table),
  removeChannel: () => {
    state.removeChannelCount += 1
    // Real supabase-js tears the channel down synchronously and re-fires the
    // status callback with CLOSED on the same stack. Replicate that so the
    // watcher's reconnect path is exercised against the actual re-entrancy
    // that crashed prod, not a sanitized no-op.
    if (state.removeChannelRefiresClosed) {
      const cb = state.channelSubscribeCallbacks.at(-1)
      cb?.('CLOSED')
    }
    return 'ok' as const
  },
}

const logger = {
  debug: () => {},
  error: (message: string, meta?: TestRecord) => state.logError.push({ message, meta: meta ?? {} }),
  info: (message: string, meta?: TestRecord) => state.logInfo.push({ message, meta: meta ?? {} }),
  warn: (message: string, meta?: TestRecord) => state.logWarn.push({ message, meta: meta ?? {} }),
}

class ModeratorApiError extends Error {
  readonly _body: string

  constructor(body: string) {
    super(body)
    this.name = 'ModeratorApiError'
    this._body = body
  }
}

vi.doMock('@dotabod/shared-utils', () => ({
  botStatus: { isBanned: false },
  checkBotStatus: async () => await Promise.resolve(state.isBanned),
  commandDisable: {
    disable: async (userId: string, reason: string, metadata?: TestRecord) => {
      state.commandDisableCalls.push({ kind: 'disable', metadata, reason, userId })
      await Promise.resolve()
    },
    enable: async (userId: string, opts?: { reason?: string; autoResolved?: boolean }) => {
      state.commandDisableCalls.push({ kind: 'enable', opts, userId })
      await Promise.resolve()
    },
  },
  default: supabaseMock,
  fetchConduitId: async () => await Promise.resolve(state.conduitId),
  getTwitchAPI: async () =>
    await Promise.resolve({
      moderation: {
        addModerator: async (broadcasterId: string) => {
          state.addModeratorCalls.push(broadcasterId)
          if (state.addModeratorError !== null && state.addModeratorError !== undefined) {
            throw state.addModeratorError instanceof Error
              ? state.addModeratorError
              : new ModeratorApiError(state.addModeratorError._body)
          }
          await Promise.resolve()
        },
      },
    }),
  getTwitchHeaders: async () => await Promise.resolve({}),
  logger,
  supabase: supabaseMock,
}))

vi.doMock('../twitch/lib/bot-api-singleton', () => ({
  getBotInstance: () => ({
    streams: {
      getStreamByUserId: async () => {
        if (state.streamError) {
          return await Promise.reject(state.streamError)
        }
        return await Promise.resolve(state.stream)
      },
    },
    users: { getUserById: async () => await Promise.resolve(state.streamer) },
  }),
}))

vi.doMock(import('../twitch/lib/get-account-ids'), () => ({
  getAccountIds: async () => await Promise.resolve(state.accountIds),
  getAllAccountIds: async () => await Promise.resolve(state.accountIds),
}))

vi.doMock('../subscribe-chat-messages-for-user', () => ({
  genericSubscribe: async (conduitId: string, userId: string, type: keyof TwitchEventTypes) => {
    state.subscribeCalls.push({ conduitId, type, userId })
    return await state.subscribeResult(userId, type)
  },
  subscribeToAuthGrantOrRevoke: async () => {
    await Promise.resolve()
    return true
  },
}))

// Test-controlled fetch: each call shifts the next queued response.
interface FetchReply {
  json: TestValue
  status: number
}

interface FetchState {
  calls: string[]
  queue: FetchReply[]
}

export const fetchState: FetchState = {
  calls: [],
  queue: [],
}
vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  let url: string
  if (input instanceof Request) {
    const { url: requestUrl } = input
    url = requestUrl
  } else if (input instanceof URL) {
    const { href } = input
    url = href
  } else {
    url = input
  }
  fetchState.calls.push(url)
  const next = fetchState.queue.shift() ?? { json: {}, status: 200 }
  return await Promise.resolve(
    Response.json(next.json, {
      headers: { 'content-type': 'application/json' },
      status: next.status,
    })
  )
})

// Import after mocks are registered.
export const { eventSubMap } = await import('../chat-sub-ids')
export const { runSubscriptionHealthCheck } = await import('../utils/subscription-health-check')
export const { RateLimiter } = await import('../utils/rate-limiter-core')
export const { fetchExistingSubscriptions, subsToCleanup } =
  await import('../fetch-existing-subscriptions')
export const { initUserSubscriptions } = await import('../init-user-subscriptions')
export const { subscribeToEvents } = await import('../subscribe-to-events')
export const { executeRevoke, revokeEvent, stopUserSubscriptions } =
  await import('../twitch/lib/revoke-event')
export const { handleNewUser } = await import('../handle-new-user')
export const { ensureBotIsModerator } = await import('../ensure-bot-is-moderator')
export const { checkAndFixUserSubscriptions } = await import('../utils/rate-limiter')
const { setupAccountWatcher: setupAccountWatcherWithDependencies } = await import('../watcher')

export const setupAccountWatcher = function setupAccountWatcher(): void {
  setupAccountWatcherWithDependencies({
    executeHandler: (operation) => {
      state.watcherOperations.push(operation)
    },
  })
}

export const seedSubscriptions = function seedSubscriptions(
  userId: string,
  types: readonly (keyof TwitchEventTypes)[]
) {
  const subscriptions: Partial<
    Record<keyof TwitchEventTypes, Pick<TwitchEventSubResponse['data'][0], 'id' | 'status'>>
  > = {}
  for (const type of types) {
    subscriptions[type] = { id: `${userId}-${type}`, status: 'enabled' }
  }
  eventSubMap.set(userId, subscriptions)
}

export const clearSubscriptions = function clearSubscriptions() {
  eventSubMap.clear()
}
