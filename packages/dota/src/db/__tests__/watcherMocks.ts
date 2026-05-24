// Test harness for packages/dota/src/db/watcher.ts. Filename intentionally
// not `.test.ts` so the runner skips it.
//
// The watcher registers postgres_changes handlers via supabase.channel().on().
// This harness captures those handlers by event+table so tests can fire them
// directly, mirroring the twitch-events sharedMocks pattern.
import { vi } from 'vite-plus/test'
import { buildSharedUtilsMock, initTestI18n } from '../../__tests__/sharedMocks'

type ChannelHandler = (payload: {
  new?: Record<string, unknown>
  old?: Record<string, unknown>
  eventType?: string
}) => unknown

export const watcherState: {
  channelHandlers: Map<string, ChannelHandler>
  channelSubscribeCallbacks: Array<(status: string, err?: Error) => void>
  channelCreationCount: number
  // Captured calls to the mocked clearCacheForUser. Side effect: removes the
  // client's token from gsiHandlers (mimicking the real implementation), but
  // does NOT touch invalidTokens (that's the watcher's job — see watcher.ts
  // comments and clearCacheForUser.ts).
  clearCacheCalls: Array<{ token: string; accountId?: string }>
  // Captured toggleDotabod calls (commandDisable setting handler).
  toggleDotabodCalls: Array<{ userId: string; enable: boolean; name?: string; locale?: string }>
  // Captured findUser results, indexed by token. Tests seed gsiHandlers
  // directly with fake handlers — findUser reads from that map, so seeding
  // gsiHandlers is enough; this state is just for assertion convenience.
  loggerInfoCalls: Array<{ message: string; meta: Record<string, unknown> }>
  loggerErrorCalls: Array<{ message: string; meta: Record<string, unknown> }>
} = {
  channelHandlers: new Map(),
  channelSubscribeCallbacks: [],
  channelCreationCount: 0,
  clearCacheCalls: [],
  toggleDotabodCalls: [],
  loggerInfoCalls: [],
  loggerErrorCalls: [],
}

export function resetWatcherState() {
  watcherState.channelHandlers = new Map()
  watcherState.channelSubscribeCallbacks = []
  watcherState.channelCreationCount = 0
  watcherState.clearCacheCalls = []
  watcherState.toggleDotabodCalls = []
  watcherState.loggerInfoCalls = []
  watcherState.loggerErrorCalls = []
}

// Chainable supabase mock. Only the subscriptions table (queried via
// `.single()` after various `.eq().neq().in().order().limit()` calls) returns
// real data; other tables resolve to empty.
function sbBuilder(_table: string) {
  const b: any = {
    select: () => b,
    update: () => b,
    upsert: () => Promise.resolve({ data: null, error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    eq: () => b,
    neq: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    is: () => b,
    not: () => b,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled),
  }
  return b
}

function realtimeChannel() {
  const ch: any = {
    on: (_type: string, opts: { event: string; table: string }, handler: ChannelHandler) => {
      watcherState.channelHandlers.set(`${opts.event}:${opts.table}`, handler)
      return ch
    },
    subscribe: (cb?: (status: string, err?: Error) => void) => {
      if (cb) {
        watcherState.channelSubscribeCallbacks.push(cb)
        cb('SUBSCRIBED')
      }
      return ch
    },
  }
  return ch
}

const supabaseMock = {
  from: (table: string) => sbBuilder(table),
  channel: () => {
    watcherState.channelCreationCount++
    return realtimeChannel()
  },
  removeChannel: () => 'ok' as const,
}

const loggerMock = {
  info: (message: string, meta?: Record<string, unknown>) =>
    watcherState.loggerInfoCalls.push({ message, meta: meta ?? {} }),
  warn: () => undefined,
  error: (message: string, meta?: Record<string, unknown>) =>
    watcherState.loggerErrorCalls.push({ message, meta: meta ?? {} }),
  debug: () => undefined,
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    supabase: supabaseMock,
    logger: loggerMock,
    // Twurple auth provider — watcher's UPDATE:accounts handler calls
    // removeUser when the token is refreshed.
    getAuthProvider: () => ({ removeUser: () => undefined }),
    getTwitchAPI: async () => ({}),
  }),
)

// Mock clearCacheForUser so we can assert it was called AND so the watcher
// test focuses on the watcher's invalidTokens management. Side effect mimics
// the real impl: removes the token from gsiHandlers. Does NOT touch
// invalidTokens — verified separately in clearCacheForUser.test.ts.
vi.doMock('../../dota/clearCacheForUser', () => ({
  clearCacheForUser: async (client?: {
    token: string
    Account?: { providerAccountId?: string }
  }) => {
    if (!client) return
    watcherState.clearCacheCalls.push({
      token: client.token,
      accountId: client.Account?.providerAccountId,
    })
    const { gsiHandlers } = await import('../../dota/lib/consts')
    gsiHandlers.delete(client.token)
    return true
  },
}))

// toggleDotabod fires on settings.commandDisable updates. Watcher unit tests
// don't exercise that path, but the import has to resolve.
vi.doMock('../../twitch/toggleDotabod', () => ({
  toggleDotabod: (userId: string, enable: boolean, name?: string, locale?: string) => {
    watcherState.toggleDotabodCalls.push({ userId, enable, name, locale })
  },
}))

// twitchChat is an EventEmitter wrapper around the steam socket; the watcher
// only .emit()s into it on commandDisable changes. Stub to a no-op emitter.
vi.doMock('../../steam/ws', () => ({
  twitchChat: { emit: () => undefined },
  steamSocket: { emit: () => undefined },
}))

vi.doMock('../../twitch/chatClient', () => ({
  chatClient: { say: () => Promise.resolve() },
}))

// handleScheduledMessages / handleStreamStatusTransition / getDBUser are only
// reached by code paths our tests don't drive. Stub them so the import graph
// resolves without dragging in their transitive dependencies.
vi.doMock('../handleScheduledMessages', () => ({
  handleUserOnlineMessages: async () => undefined,
}))

vi.doMock('../handleStreamStatusTransition', () => ({
  handleStreamStatusTransition: () => ({ wentOffline: false, cameOnline: false }),
}))

vi.doMock('../getDBUser', () => ({
  default: async () => ({ reason: 'stub', result: null }),
}))

vi.doMock('../../dota/lib/ranks', () => ({
  getRankDetail: async () => ({}),
}))

vi.doMock('../../dota/server', () => ({
  server: { io: { to: () => ({ emit: () => undefined }) } },
}))

await initTestI18n()

// Re-export the singletons the watcher writes into so tests can assert on them
// directly.
export const { gsiHandlers, invalidTokens, twitchIdToToken, twitchNameToToken } =
  await import('../../dota/lib/consts')

// Import the watcher LAST so the mocks above are in place when its top-level
// `supabase.channel(...)` call runs in the constructor.
const SetupSupabaseModule = await import('../watcher')
export const SetupSupabase = SetupSupabaseModule.default

/**
 * Build and start a watcher instance, returning the captured channel handlers.
 * Call after resetWatcherState() in beforeEach.
 */
export function startWatcher() {
  const watcher = new SetupSupabase()
  watcher.init()
  return watcher
}

/** Fire a captured handler by event+table key. */
export async function fire(
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  table:
    | 'users'
    | 'accounts'
    | 'subscriptions'
    | 'settings'
    | 'steam_accounts'
    | 'gift_subscriptions',
  payload: { new?: Record<string, unknown>; old?: Record<string, unknown>; eventType?: string },
) {
  const handler = watcherState.channelHandlers.get(`${event}:${table}`)
  if (!handler) throw new Error(`no handler for ${event}:${table}`)
  await handler(payload)
}

/** Seed gsiHandlers with a fake handler so findUser(token) returns the client. */
export function seedClient(opts: {
  userId: string
  token?: string
  name?: string
  providerAccountId?: string
}) {
  const token = opts.token ?? opts.userId
  const client: any = {
    token,
    name: opts.name ?? `user-${opts.userId}`,
    Account: opts.providerAccountId ? { providerAccountId: opts.providerAccountId } : undefined,
    SteamAccount: [],
    settings: [],
  }
  const handler: any = {
    client,
    token,
    disable: () => undefined,
    getChannelId: () => null,
  }
  gsiHandlers.set(token, handler)
  if (opts.providerAccountId) twitchIdToToken.set(opts.providerAccountId, token)
  if (client.name) twitchNameToToken.set(client.name, token)
  return { client, handler }
}

export function resetCaches() {
  gsiHandlers.clear()
  invalidTokens.clear()
  twitchIdToToken.clear()
  twitchNameToToken.clear()
}
