// Shared test harness for twitch-chat. Filename is intentionally NOT `.test.ts`
// so bun's runner ignores it.
//
// Why this exists: bun's `vi.doMock()` is process-wide. Any test file that
// needs `@dotabod/shared-utils`, `i18next`, or the sibling modules below mocked
// must route through this single harness so competing factories for the same
// module spec don't collide when the whole suite runs together. Import the SUT
// from here, not from its real path. (The pure transform tests don't touch
// these modules, so they import their SUTs directly.)
import { vi } from 'vitest'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type LogValue = JsonValue | Error | Date | undefined
type LogMeta = { [key: string]: LogValue }
type EmitOptions = Parameters<(typeof import('../utils/socket-manager'))['emitChatMessage']>[3]

interface FetchResponse {
  ok: boolean
  status?: number
  statusText?: string
  text?: () => Promise<string>
  json?: () => Promise<JsonValue>
}

interface UserUpdateValues {
  displayName?: string
  email?: string
  name?: string
  stream_online?: boolean
  stream_start_date?: string
  updated_at?: string
}

interface TestState {
  isBanned: boolean
  hasSocket: boolean
  emitCalls: {
    broadcasterLogin: string
    chatterLogin: string
    text: string
    opts: EmitOptions
  }[]
  fetchCalls: { url: string; options: RequestInit | undefined }[]
  fetchImpl: (url: string, options: RequestInit | undefined) => Promise<FetchResponse>
  fetchThrows: Error | null
  logError: { message: string; meta: LogMeta }[]
  logInfo: { message: string; meta: LogMeta }[]
  // supabase: accounts.select(...).single() result, and captured users.update() calls.
  dbAccount: { userId: string } | null
  accountError: Error | null
  userUpdates: { values: UserUpdateValues; whereId: string }[]
}

export const state: TestState = {
  accountError: null,
  dbAccount: { userId: 'user-1' },
  emitCalls: [],
  fetchCalls: [],
  fetchImpl: async () =>
    await Promise.resolve({
      json: async () => await Promise.resolve({ data: [{ is_sent: true, message_id: 'mid' }] }),
      ok: true,
    }),
  fetchThrows: null,
  hasSocket: true,
  isBanned: false,
  logError: [],
  logInfo: [],
  userUpdates: [],
}

export const resetState = function resetState() {
  disableUserCache.clear()
  state.isBanned = false
  state.hasSocket = true
  state.emitCalls = []
  state.fetchCalls = []
  state.fetchImpl = async () =>
    await Promise.resolve({
      json: async () => await Promise.resolve({ data: [{ is_sent: true, message_id: 'mid' }] }),
      ok: true,
    })
  state.fetchThrows = null
  state.logError = []
  state.logInfo = []
  state.dbAccount = { userId: 'user-1' }
  state.accountError = null
  state.userUpdates = []
  clearDedupeCache()
}

// Minimal chainable supabase mock: accounts.select().eq()...single() yields
// state.dbAccount; users.update(values).eq('id', x) records into userUpdates.
interface SupabaseBuilder {
  select: () => SupabaseBuilder
  eq: (col: string, val: string) => SupabaseBuilder
  single: () => Promise<{ data: { userId: string } | null; error: Error | null }>
  update: (values: UserUpdateValues) => SupabaseUpdateBuilder
}

interface SupabaseUpdateBuilder {
  eq: (col: string, val: string) => Promise<{ data: null; error: null }>
}

const createSupabaseBuilder = function createSupabaseBuilder() {
  const builder: SupabaseBuilder = {
    eq: () => builder,
    select: () => builder,
    single: async () => await Promise.resolve({ data: state.dbAccount, error: state.accountError }),
    update: (values: UserUpdateValues) => ({
      eq: async (col: string, val: string) => {
        if (col === 'id') {
          state.userUpdates.push({ values, whereId: val })
        }
        return await Promise.resolve({ data: null, error: null })
      },
    }),
  }
  return builder
}
const supabaseMock = { from: () => createSupabaseBuilder() }

vi.doMock('@dotabod/shared-utils', () => ({
  checkBotStatus: async () => await Promise.resolve(state.isBanned),
  getTwitchHeaders: async () => await Promise.resolve({ Authorization: 'Bearer test' }),
  logger: {
    debug: () => {},
    error: (message: string, meta?: LogMeta) => state.logError.push({ message, meta: meta ?? {} }),
    info: (message: string, meta?: LogMeta) => state.logInfo.push({ message, meta: meta ?? {} }),
    warn: () => {},
  },
  supabase: supabaseMock,
}))

vi.doMock('i18next', () => ({
  t: (key: string) => `t:${key}`,
}))

vi.doMock(import('../utils/socket-manager'), () => ({
  emitChatMessage: (
    broadcasterLogin: string,
    chatterLogin: string,
    text: string,
    opts: EmitOptions
  ) => {
    state.emitCalls.push({ broadcasterLogin, chatterLogin, opts, text })
  },
  hasDotabodSocket: () => state.hasSocket,
}))

// Minimal controllable stand-in for the `ws` WebSocket so EventsubSocket tests
// can drive open/message/close/error synchronously with no real network. Tests
// reach the live instance via FakeWebSocket.latest() and reset between cases.
export class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []
  static reset() {
    FakeWebSocket.instances.length = 0
  }
  static latest(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1)
    if (!instance) {
      throw new Error('No fake WebSocket instance exists')
    }
    return instance
  }
  url: string
  readyState: number = FakeWebSocket.CONNECTING
  private readonly handlers = new Map<string, ((event: FakeWebSocketEvent) => void)[]>()
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  addEventListener(type: string, cb: (event: FakeWebSocketEvent) => void) {
    const list = this.handlers.get(type) ?? []
    list.push(cb)
    this.handlers.set(type, list)
  }
  removeAllListeners() {
    this.handlers.clear()
  }
  close() {
    if (this.readyState === FakeWebSocket.CLOSED || this.readyState === FakeWebSocket.CLOSING) {
      return
    }
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
  private fire(type: string, event: FakeWebSocketEvent) {
    const list = this.handlers.get(type) ?? []
    // Mirror Node's EventEmitter: an 'error' with no listener throws.
    if (type === 'error' && list.length === 0) {
      throw new Error(event.message ?? 'Unhandled error')
    }
    for (const cb of list) {
      cb({ target: this, ...event })
    }
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.fire('open', {})
  }
  message(obj: JsonValue) {
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

interface FakeWebSocketEvent {
  code?: number
  data?: string
  message?: string
  reason?: string
  target?: FakeWebSocket
  type?: string
  wasClean?: boolean
}

vi.doMock('ws', () => ({ default: FakeWebSocket }))

// Route fetch through state so each test controls the HTTP response.
globalThis.fetch = vi.fn<typeof fetch>(async (input, options) => {
  const url = String(input)
  state.fetchCalls.push({ options, url })
  if (state.fetchThrows !== null) {
    throw state.fetchThrows
  }
  const reply = await state.fetchImpl(url, options)
  const status = reply.status ?? (reply.ok ? 200 : 500)
  const body = reply.ok ? JSON.stringify((await reply.json?.()) ?? null) : await reply.text?.()
  return new Response(body, { status, statusText: reply.statusText })
})

// Import after mocks are registered. disableCache is the REAL module (not
// mocked) so its logic is covered; tests drive it via disableUserCache.
export const {
  disableUserCache,
  clearDisableCache,
  isUserBeingDisabled,
  isBroadcasterBeingDisabled,
} = await import('../disable-cache')
export const { onlineEvents } = await import('../event-handlers/events')
export const { onlineEvent } = await import('../event-handlers/online-event')
export const { offlineEvent } = await import('../event-handlers/offline-event')
export const { updateUserEvent } = await import('../event-handlers/update-user-event')
export const { sendTwitchChatMessage, handleChatMessage, clearDedupeCache } =
  await import('../handle-chat')
// EventSub socket SUT — imported here (after the `ws` mock above) so the tests
// drive the controllable FakeWebSocket instead of a real connection.
export const { EventsubSocket, isEventsubConnected } = await import('../event-sub-socket')

export const flushMacrotasks = async () => {
  await new Promise<void>((r) => setTimeout(r, 5))
}
