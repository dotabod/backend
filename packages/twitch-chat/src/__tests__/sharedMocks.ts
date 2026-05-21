// Shared test harness for twitch-chat. Filename is intentionally NOT `.test.ts`
// so bun's runner ignores it.
//
// Why this exists: bun's `mock.module()` is process-wide. Any test file that
// needs `@dotabod/shared-utils`, `i18next`, or the sibling modules below mocked
// must route through this single harness so competing factories for the same
// module spec don't collide when the whole suite runs together. Import the SUT
// from here, not from its real path. (The pure transform tests don't touch
// these modules, so they import their SUTs directly.)
import { mock } from 'bun:test'

type FetchResponse = {
  ok: boolean
  status?: number
  statusText?: string
  text?: () => Promise<string>
  json?: () => Promise<unknown>
}

export const state: {
  isBanned: boolean
  hasSocket: boolean
  emitCalls: Array<{
    broadcasterLogin: string
    chatterLogin: string
    text: string
    opts: Record<string, unknown>
  }>
  fetchCalls: Array<{ url: string; options: any }>
  fetchImpl: (url: string, options: any) => Promise<FetchResponse>
  fetchThrows: unknown
  logError: Array<{ message: string; meta: Record<string, unknown> }>
  // supabase: accounts.select(...).single() result, and captured users.update() calls.
  dbAccount: { userId: string } | null
  accountError: unknown
  userUpdates: Array<{ values: Record<string, unknown>; whereId: unknown }>
} = {
  isBanned: false,
  hasSocket: true,
  emitCalls: [],
  fetchCalls: [],
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ data: [{ message_id: 'mid', is_sent: true }] }),
  }),
  fetchThrows: null,
  logError: [],
  dbAccount: { userId: 'user-1' },
  accountError: null,
  userUpdates: [],
}

export function resetState() {
  disableUserCache.clear()
  state.isBanned = false
  state.hasSocket = true
  state.emitCalls = []
  state.fetchCalls = []
  state.fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: [{ message_id: 'mid', is_sent: true }] }),
  })
  state.fetchThrows = null
  state.logError = []
  state.dbAccount = { userId: 'user-1' }
  state.accountError = null
  state.userUpdates = []
  clearDedupeCache()
}

// Minimal chainable supabase mock: accounts.select().eq()...single() yields
// state.dbAccount; users.update(values).eq('id', x) records into userUpdates.
function createSupabaseBuilder() {
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      if (builder._updateValues && col === 'id') {
        state.userUpdates.push({ values: builder._updateValues, whereId: val })
        return Promise.resolve({ data: null, error: null })
      }
      return builder
    },
    single: async () => ({ data: state.dbAccount, error: state.accountError }),
    update: (values: Record<string, unknown>) => {
      builder._updateValues = values
      return builder
    },
    _updateValues: null as Record<string, unknown> | null,
  }
  return builder
}
const supabaseMock = { from: () => createSupabaseBuilder() }

mock.module('@dotabod/shared-utils', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    error: (message: string, meta?: Record<string, unknown>) =>
      state.logError.push({ message, meta: meta ?? {} }),
  },
  checkBotStatus: async () => state.isBanned,
  getTwitchHeaders: async () => ({ Authorization: 'Bearer test' }),
  supabase: supabaseMock,
}))

mock.module('i18next', () => ({
  t: (key: string) => `t:${key}`,
}))

mock.module('../utils/socketManager', () => ({
  hasDotabodSocket: () => state.hasSocket,
  emitChatMessage: (
    broadcasterLogin: string,
    chatterLogin: string,
    text: string,
    opts: Record<string, unknown>,
  ) => {
    state.emitCalls.push({ broadcasterLogin, chatterLogin, text, opts })
  },
}))

// Route fetch through state so each test controls the HTTP response.
globalThis.fetch = (async (url: string, options: any) => {
  state.fetchCalls.push({ url, options })
  if (state.fetchThrows) throw state.fetchThrows
  return state.fetchImpl(url, options)
}) as unknown as typeof fetch

// Import after mocks are registered. disableCache is the REAL module (not
// mocked) so its logic is covered; tests drive it via disableUserCache.
export const {
  disableUserCache,
  clearDisableCache,
  isUserBeingDisabled,
  isBroadcasterBeingDisabled,
} = await import('../disableCache')
export const { onlineEvents } = await import('../event-handlers/events')
export const { onlineEvent } = await import('../event-handlers/onlineEvent')
export const { offlineEvent } = await import('../event-handlers/offlineEvent')
export const { updateUserEvent } = await import('../event-handlers/updateUserEvent')
export const {
  sendTwitchChatMessage,
  handleChatMessage,
  ChatMessageResponseCode,
  clearDedupeCache,
} = await import('../handleChat')

export const flushMacrotasks = () => new Promise<void>((r) => setTimeout(r, 5))
