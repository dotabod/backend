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
  isDisabled: boolean
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
} = {
  isDisabled: false,
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
}

export function resetState() {
  state.isDisabled = false
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
  clearDedupeCache()
}

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
}))

mock.module('i18next', () => ({
  t: (key: string) => `t:${key}`,
}))

mock.module('../disableCache', () => ({
  isBroadcasterBeingDisabled: () => state.isDisabled,
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

// Import after mocks are registered.
export const {
  sendTwitchChatMessage,
  handleChatMessage,
  ChatMessageResponseCode,
  clearDedupeCache,
} = await import('../handleChat')
