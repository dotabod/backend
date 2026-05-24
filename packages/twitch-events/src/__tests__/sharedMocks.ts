// Shared test harness for twitch-events. Filename is intentionally NOT
// `.test.ts` so bun's runner ignores it.
//
// Why this exists: bun's `vi.doMock()` is process-wide. Every test file that
// needs `@dotabod/shared-utils` (or the sibling modules below) mocked must go
// through this single harness, otherwise competing factories for the same
// module spec collide when the whole suite runs together (passes in isolation,
// fails together). Import the SUTs from here, not from their real paths.
import { vi } from 'vite-plus/test'
import type { TwitchEventTypes } from '../TwitchEventTypes.ts'

type LogCall = { message: string; meta: Record<string, unknown> }
type SubscribeCall = { conduitId: string; userId: string; type: keyof TwitchEventTypes }

export const state: {
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
  dbSettings: Array<{ key: string; value: unknown }>
  upserts: Array<{ table: string; values: Record<string, unknown> }>
  updates: Array<{ table: string; values: Record<string, unknown> }>
  commandDisableCalls: Array<
    | { kind: 'disable'; userId: string; reason: string; metadata?: Record<string, unknown> }
    | { kind: 'enable'; userId: string; opts?: { reason?: string; autoResolved?: boolean } }
  >
  // botApi (handleNewUser) + getTwitchAPI moderation (ensureBotIsModerator).
  stream: { startDate: Date } | null
  streamer: { displayName: string; name: string } | null
  addModeratorError: unknown
  addModeratorCalls: string[]
  // Supabase Realtime channel handlers registered by the watcher. Keyed by
  // "{event}:{table}" e.g. "INSERT:accounts". Tests fire them to simulate
  // postgres_changes events without a real Realtime connection.
  channelHandlers: Map<
    string,
    (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => unknown
  >
  channelSubscribeStatuses: string[]
  // Callbacks passed to `.subscribe()`. Tests fire them with a non-SUBSCRIBED
  // status (CHANNEL_ERROR/CLOSED/TIMED_OUT) to drive the reconnect path.
  channelSubscribeCallbacks: Array<(status: string, err?: Error) => void>
  // Bumped each time the watcher calls `supabase.channel(...)`. Starts at 0;
  // setupAccountWatcher() bumps to 1, each reconnect bumps further.
  channelCreationCount: number
  // Bumped each time the watcher calls `supabase.removeChannel(...)`.
  removeChannelCount: number
  // If non-empty, sbBuilder.single() on the `accounts` table shifts the next
  // entry off this queue. Lets tests script per-call lookup behavior (e.g.
  // first lookup returns null, second returns a row) and inject transient DB
  // errors. Each entry's `data` shape depends on which call site you're
  // mocking — `findUserIdByProviderAccount` selects `userId`, the watcher's
  // UPDATE:users handler selects `providerAccountId`. Falls back to `dbUser`
  // (with error: null) when the queue is empty.
  accountsLookupResults: Array<{ data: Record<string, unknown> | null; error: Error | null }>
  // Same shape as accountsLookupResults but consumed by `users.single()` calls
  // (e.g. handleNewUser's ban check). Falls back to `{ data: null, error: null }`
  // — benign for tests that don't care about ban status.
  usersLookupResults: Array<{ data: Record<string, unknown> | null; error: Error | null }>
  // When set, botApi.streams.getStreamByUserId throws this error. Lets tests
  // verify the handleNewUser path continues into subscription registration
  // even when the Twitch profile-fetch step fails.
  streamError: Error | null
} = {
  conduitId: 'conduit-1',
  isBanned: false,
  accountIds: [],
  subscribeResult: () => true,
  subscribeCalls: [],
  logInfo: [],
  logWarn: [],
  logError: [],
  dbUser: { userId: 'user-1' },
  dbSettings: [],
  upserts: [],
  updates: [],
  commandDisableCalls: [],
  stream: null,
  streamer: { displayName: 'Streamer', name: 'streamer' },
  addModeratorError: null,
  addModeratorCalls: [],
  channelHandlers: new Map(),
  channelSubscribeStatuses: [],
  channelSubscribeCallbacks: [],
  channelCreationCount: 0,
  removeChannelCount: 0,
  accountsLookupResults: [],
  usersLookupResults: [],
  streamError: null,
}

export function resetState() {
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
  state.removeChannelCount = 0
  state.accountsLookupResults = []
  state.usersLookupResults = []
  state.streamError = null
}

// Chainable supabase mock. accounts...single() -> dbUser; settings select ->
// dbSettings; update/upsert/delete are captured / resolve.
interface SbBuilder {
  select: () => SbBuilder
  update: (v: Record<string, unknown>) => SbBuilder
  delete: () => SbBuilder
  upsert: (v: Record<string, unknown>) => Promise<{ data: null; error: null }>
  eq: () => SbBuilder
  single: () => Promise<{ data: unknown; error: Error | null }>
  then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => unknown
}

function sbBuilder(table: string) {
  let mode: 'select' | 'update' | 'delete' = 'select'
  let values: Record<string, unknown> = {}
  const b: SbBuilder = {
    select: () => b,
    update: (v: Record<string, unknown>) => {
      mode = 'update'
      values = v
      return b
    },
    delete: () => {
      mode = 'delete'
      return b
    },
    upsert: (v: Record<string, unknown>) => {
      state.upserts.push({ table, values: v })
      return Promise.resolve({ data: null, error: null })
    },
    eq: () => b,
    single: async () => {
      if (table === 'accounts') {
        if (state.accountsLookupResults.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: length-guarded
          return state.accountsLookupResults.shift()!
        }
        return { data: state.dbUser, error: null }
      }
      if (table === 'users') {
        if (state.usersLookupResults.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: length-guarded
          return state.usersLookupResults.shift()!
        }
        return { data: null, error: null }
      }
      return { data: null, error: null }
    },
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => {
      if (mode === 'update') state.updates.push({ table, values })
      const data = mode === 'select' && table === 'settings' ? state.dbSettings : null
      return Promise.resolve({ data, error: null }).then(onFulfilled)
    },
  }
  return b
}
interface RealtimeChannelMock {
  on: (
    type: string,
    opts: { event: string; schema: string; table: string },
    handler: (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => unknown,
  ) => RealtimeChannelMock
  subscribe: (cb?: (status: string, err?: Error) => void) => RealtimeChannelMock
}

function realtimeChannelMock(): RealtimeChannelMock {
  const channel: RealtimeChannelMock = {
    on: (_type, opts, handler) => {
      state.channelHandlers.set(`${opts.event}:${opts.table}`, handler)
      return channel
    },
    subscribe: (cb) => {
      state.channelSubscribeStatuses.push('SUBSCRIBED')
      if (cb) state.channelSubscribeCallbacks.push(cb)
      cb?.('SUBSCRIBED')
      return channel
    },
  }
  return channel
}

const supabaseMock = {
  from: (table: string) => sbBuilder(table),
  channel: () => {
    state.channelCreationCount++
    return realtimeChannelMock()
  },
  removeChannel: (_channel: unknown) => {
    state.removeChannelCount++
    return 'ok' as const
  },
}

const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    state.logInfo.push({ message, meta: meta ?? {} }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    state.logWarn.push({ message, meta: meta ?? {} }),
  error: (message: string, meta?: Record<string, unknown>) =>
    state.logError.push({ message, meta: meta ?? {} }),
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () => ({
  logger,
  supabase: supabaseMock,
  default: supabaseMock,
  commandDisable: {
    disable: async (userId: string, reason: string, metadata?: Record<string, unknown>) => {
      state.commandDisableCalls.push({ kind: 'disable', userId, reason, metadata })
    },
    enable: async (userId: string, opts?: { reason?: string; autoResolved?: boolean }) => {
      state.commandDisableCalls.push({ kind: 'enable', userId, opts })
    },
  },
  botStatus: { isBanned: false },
  checkBotStatus: async () => state.isBanned,
  fetchConduitId: async () => state.conduitId,
  getTwitchHeaders: async () => ({}),
  getTwitchAPI: async () => ({
    moderation: {
      addModerator: async (broadcasterId: string) => {
        state.addModeratorCalls.push(broadcasterId)
        if (state.addModeratorError) throw state.addModeratorError
      },
    },
  }),
}))

vi.doMock('../twitch/lib/BotApiSingleton', () => ({
  getBotInstance: () => ({
    streams: {
      getStreamByUserId: async () => {
        if (state.streamError) throw state.streamError
        return state.stream
      },
    },
    users: { getUserById: async () => state.streamer },
  }),
}))

vi.doMock('../twitch/lib/getAccountIds', () => ({
  getAccountIds: async () => state.accountIds,
  getAllAccountIds: async () => state.accountIds,
}))

vi.doMock('../subscribeChatMessagesForUser', () => ({
  genericSubscribe: async (conduitId: string, userId: string, type: keyof TwitchEventTypes) => {
    state.subscribeCalls.push({ conduitId, userId, type })
    return state.subscribeResult(userId, type)
  },
  subscribeToAuthGrantOrRevoke: async () => undefined,
}))

// Test-controlled fetch: each call shifts the next queued response.
export const fetchState: { queue: Array<Record<string, unknown>>; calls: string[] } = {
  queue: [],
  calls: [],
}
globalThis.fetch = (async (url: string) => {
  fetchState.calls.push(String(url))
  const next = fetchState.queue.shift() ?? { status: 200, json: {} }
  return {
    ok: ((next.status as number) ?? 200) >= 200 && ((next.status as number) ?? 200) < 300,
    status: (next.status as number) ?? 200,
    headers: new Headers(),
    json: async () => next.json ?? {},
    text: async () => '',
  }
}) as unknown as typeof fetch

// Import after mocks are registered.
export const { eventSubMap } = await import('../chatSubIds')
export const { runSubscriptionHealthCheck } = await import('../utils/subscriptionHealthCheck')
export const { RateLimiter } = await import('../utils/rateLimiterCore')
export const { fetchExistingSubscriptions, subsToCleanup } =
  await import('../fetchExistingSubscriptions')
export const { initUserSubscriptions } = await import('../initUserSubscriptions')
export const { subscribeToEvents } = await import('../subscribeToEvents')
export const { revokeEvent, stopUserSubscriptions } = await import('../twitch/lib/revokeEvent')
export const { handleNewUser } = await import('../handleNewUser')
export const { ensureBotIsModerator } = await import('../ensureBotIsModerator')
export const { checkAndFixUserSubscriptions } = await import('../utils/rateLimiter')
export const { setupAccountWatcher } = await import('../watcher')

export function seedSubscriptions(userId: string, types: readonly (keyof TwitchEventTypes)[]) {
  eventSubMap[userId] = Object.fromEntries(
    types.map((type) => [type, { id: `${userId}-${type}`, status: 'enabled' }]),
  ) as (typeof eventSubMap)[string]
}

export function clearSubscriptions() {
  for (const key of Object.keys(eventSubMap)) delete eventSubMap[key]
}
