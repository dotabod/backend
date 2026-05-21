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
} = {
  conduitId: 'conduit-1',
  isBanned: false,
  accountIds: [],
  subscribeResult: () => true,
  subscribeCalls: [],
  logInfo: [],
  logWarn: [],
  logError: [],
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

mock.module('@dotabod/shared-utils', () => ({
  logger,
  supabase: {},
  default: {},
  checkBotStatus: async () => state.isBanned,
  fetchConduitId: async () => state.conduitId,
  getTwitchHeaders: async () => ({}),
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

// Import after mocks are registered.
export const { eventSubMap } = await import('../chatSubIds')
export const { runSubscriptionHealthCheck } = await import('../utils/subscriptionHealthCheck')
export const { RateLimiter } = await import('../utils/rateLimiterCore')

export function seedSubscriptions(userId: string, types: (keyof TwitchEventTypes)[]) {
  eventSubMap[userId] = Object.fromEntries(
    types.map((type) => [type, { id: `${userId}-${type}`, status: 'enabled' }]),
  ) as (typeof eventSubMap)[string]
}

export function clearSubscriptions() {
  for (const key of Object.keys(eventSubMap)) delete eventSubMap[key]
}
