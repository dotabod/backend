// Shared test harness for twitch-chat. Filename is intentionally NOT `.test.ts`
// so bun's runner ignores it.
//
// Why this exists: bun's `vi.doMock()` is process-wide. Any test file that
// needs `@dotabod/shared-utils`, `i18next`, or the sibling modules below mocked
// must route through this single harness so competing factories for the same
// module spec don't collide when the whole suite runs together. Import the SUT
// from here, not from its real path. (The pure transform tests don't touch
// these modules, so they import their SUTs directly.)
import { vi } from 'vite-plus/test'

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
  fetchCalls: Array<{ url: string; options: RequestInit | undefined }>
  fetchImpl: (url: string, options: RequestInit | undefined) => Promise<FetchResponse>
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
interface SupabaseBuilder {
  select: () => SupabaseBuilder
  eq: (col: string, val: unknown) => SupabaseBuilder | Promise<{ data: null; error: null }>
  single: () => Promise<{ data: { userId: string } | null; error: unknown }>
  update: (values: Record<string, unknown>) => SupabaseBuilder
  _updateValues: Record<string, unknown> | null
}

function createSupabaseBuilder() {
  const builder: SupabaseBuilder = {
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

vi.doMock('@dotabod/shared-utils', () => ({
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

vi.doMock('i18next', () => ({
  t: (key: string) => `t:${key}`,
}))

vi.doMock('../utils/socketManager', () => ({
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

// Minimal controllable stand-in for the `ws` WebSocket so EventsubSocket tests
// can drive open/message/close/error synchronously with no real network. Tests
// reach the live instance via FakeWebSocket.latest() and reset between cases.
export class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  static reset() {
    FakeWebSocket.instances = []
  }
  static latest(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  }
  url: string
  readyState: number = FakeWebSocket.CONNECTING
  private handlers: Record<string, Array<(ev: unknown) => void>> = {}
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    const list = this.handlers[type] ?? (this.handlers[type] = [])
    list.push(cb)
  }
  removeAllListeners() {
    this.handlers = {}
  }
  close() {
    if (this.readyState === FakeWebSocket.CLOSED || this.readyState === FakeWebSocket.CLOSING)
      return
    if (this.readyState === FakeWebSocket.CONNECTING) {
      // Mirror `ws`: closing a pending upgrade aborts the handshake and emits an
      // 'error' (then 'close') on a LATER tick. An unhandled 'error' crashes the
      // real process — drive it through a timer so tests can observe it.
      this.readyState = FakeWebSocket.CLOSING
      setTimeout(() => {
        this.fire('error', {
          message: 'WebSocket was closed before the connection was established',
          type: 'error',
        })
      }, 0)
      return
    }
    this.readyState = FakeWebSocket.CLOSING
  }
  send() {}
  private fire(type: string, ev: Record<string, unknown>) {
    const list = this.handlers[type] ?? []
    // Mirror Node's EventEmitter: an 'error' with no listener throws.
    if (type === 'error' && list.length === 0) {
      throw new Error(String((ev as { message?: string }).message ?? 'Unhandled error'))
    }
    for (const cb of list) cb({ target: this, ...ev })
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.fire('open', {})
  }
  message(obj: unknown) {
    this.fire('message', { data: JSON.stringify(obj) })
  }
  error(message: string) {
    this.fire('error', { message, type: 'error' })
  }
  serverClose(code = 1006, wasClean = false) {
    this.readyState = FakeWebSocket.CLOSED
    this.fire('close', { code, reason: '', wasClean })
  }
}

vi.doMock('ws', () => ({ default: FakeWebSocket }))

// Route fetch through state so each test controls the HTTP response.
globalThis.fetch = (async (url: string, options: RequestInit | undefined) => {
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
export const { sendTwitchChatMessage, handleChatMessage, clearDedupeCache } =
  await import('../handleChat')
// EventSub socket SUT — imported here (after the `ws` mock above) so the tests
// drive the controllable FakeWebSocket instead of a real connection.
export const { EventsubSocket, isEventsubConnected } = await import('../eventSubSocket')

export const flushMacrotasks = () => new Promise<void>((r) => setTimeout(r, 5))
