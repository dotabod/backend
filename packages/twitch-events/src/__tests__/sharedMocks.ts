// Shared test harness for twitch-events. Filename is intentionally NOT
// `.test.ts` so bun's runner ignores it.
//
// Why this exists: bun's `mock.module()` is process-wide. Every test file that
// needs `@dotabod/shared-utils` (or the sibling modules below) mocked must go
// through this single harness, otherwise competing factories for the same
// module spec collide when the whole suite runs together (passes in isolation,
// fails together). Import the SUTs from here, not from their real paths.
import { mock } from 'bun:test'
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
  // botApi (handleNewUser) + getTwitchAPI moderation (ensureBotIsModerator).
  stream: { startDate: Date } | null
  streamer: { displayName: string; name: string } | null
  addModeratorError: unknown
  addModeratorCalls: string[]
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
  stream: null,
  streamer: { displayName: 'Streamer', name: 'streamer' },
  addModeratorError: null,
  addModeratorCalls: [],
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
  state.stream = null
  state.streamer = { displayName: 'Streamer', name: 'streamer' }
  state.addModeratorError = null
  state.addModeratorCalls = []
}

// Chainable supabase mock. accounts...single() -> dbUser; settings select ->
// dbSettings; update/upsert/delete are captured / resolve.
function sbBuilder(table: string) {
  let mode: 'select' | 'update' | 'delete' = 'select'
  let values: Record<string, unknown> = {}
  const b: any = {
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
    single: async () => ({ data: table === 'accounts' ? state.dbUser : null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => {
      if (mode === 'update') state.updates.push({ table, values })
      const data = mode === 'select' && table === 'settings' ? state.dbSettings : null
      return Promise.resolve({ data, error: null }).then(onFulfilled)
    },
  }
  return b
}
const supabaseMock = { from: (table: string) => sbBuilder(table) }

const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    state.logInfo.push({ message, meta: meta ?? {} }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    state.logWarn.push({ message, meta: meta ?? {} }),
  error: (message: string, meta?: Record<string, unknown>) =>
    state.logError.push({ message, meta: meta ?? {} }),
  debug: () => undefined,
}

mock.module('@dotabod/shared-utils', () => ({
  logger,
  supabase: supabaseMock,
  default: supabaseMock,
  trackDisableReason: async () => undefined,
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

mock.module('../twitch/lib/BotApiSingleton', () => ({
  getBotInstance: () => ({
    streams: { getStreamByUserId: async () => state.stream },
    users: { getUserById: async () => state.streamer },
  }),
}))

mock.module('../twitch/lib/getAccountIds', () => ({
  getAccountIds: async () => state.accountIds,
  getAllAccountIds: async () => state.accountIds,
}))

mock.module('../subscribeChatMessagesForUser', () => ({
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
export const { fetchExistingSubscriptions, subsToCleanup } = await import(
  '../fetchExistingSubscriptions'
)
export const { initUserSubscriptions } = await import('../initUserSubscriptions')
export const { subscribeToEvents } = await import('../subscribeToEvents')
export const { revokeEvent, stopUserSubscriptions, deleteSubscription } = await import(
  '../twitch/lib/revokeEvent'
)
export const { handleNewUser } = await import('../handleNewUser')
export const { ensureBotIsModerator } = await import('../ensureBotIsModerator')
export const { checkAndFixUserSubscriptions } = await import('../utils/rateLimiter')

export function seedSubscriptions(userId: string, types: (keyof TwitchEventTypes)[]) {
  eventSubMap[userId] = Object.fromEntries(
    types.map((type) => [type, { id: `${userId}-${type}`, status: 'enabled' }]),
  ) as (typeof eventSubMap)[string]
}

export function clearSubscriptions() {
  for (const key of Object.keys(eventSubMap)) delete eventSubMap[key]
}
