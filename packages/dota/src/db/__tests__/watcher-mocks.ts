// Test harness for packages/dota/src/db/watcher.ts. Filename intentionally
// not `.test.ts` so the runner skips it.
//
// The watcher registers postgres_changes handlers via supabase.channel().on().
// This harness captures those handlers by event+table so tests can fire them
// directly, mirroring the twitch-events sharedMocks pattern.
import { vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createSocketClientStub,
  initTestI18n,
} from '../../__tests__/shared-mocks'

type ChannelHandler = (payload: {
  new?: Record<string, unknown>
  old?: Record<string, unknown>
  eventType?: string
}) => unknown

export const watcherState: {
  channelHandlers: Map<string, ChannelHandler>
  channelSubscribeCallbacks: ((status: string, err?: Error) => void)[]
  channelCreationCount: number
  // Captured calls to the mocked clearCacheForUser. Side effect: removes the
  // client's token from gsiHandlers (mimicking the real implementation), but
  // does NOT touch invalidTokens (that's the watcher's job — see watcher.ts
  // comments and clearCacheForUser.ts).
  clearCacheCalls: { token: string; accountId?: string }[]
  // Captured toggleDotabod calls (commandDisable setting handler).
  toggleDotabodCalls: { userId: string; enable: boolean; name?: string; locale?: string }[]
  // Captured findUser results, indexed by token. Tests seed gsiHandlers
  // directly with fake handlers — findUser reads from that map, so seeding
  // gsiHandlers is enough; this state is just for assertion convenience.
  loggerInfoCalls: { message: string; meta: Record<string, unknown> }[]
  loggerErrorCalls: { message: string; meta: Record<string, unknown> }[]
  socketEmits: { event: string; payload: string; room: string }[]
} = {
  channelCreationCount: 0,
  channelHandlers: new Map(),
  channelSubscribeCallbacks: [],
  clearCacheCalls: [],
  loggerErrorCalls: [],
  loggerInfoCalls: [],
  socketEmits: [],
  toggleDotabodCalls: [],
}

export const resetWatcherState = function resetWatcherState() {
  watcherState.channelHandlers = new Map()
  watcherState.channelSubscribeCallbacks = []
  watcherState.channelCreationCount = 0
  watcherState.clearCacheCalls = []
  watcherState.toggleDotabodCalls = []
  watcherState.loggerInfoCalls = []
  watcherState.loggerErrorCalls = []
  watcherState.socketEmits = []
}

// Chainable supabase mock. Only the subscriptions table (queried via
// `.single()` after various `.eq().neq().in().order().limit()` calls) returns
// real data; other tables resolve to empty.
const sbBuilder = function sbBuilder(_table: string) {
  const b: unknown = {
    eq: () => b,
    in: () => b,
    insert: async () => await Promise.resolve({ data: null, error: null }),
    is: () => b,
    limit: () => b,
    maybeSingle: async () => await Promise.resolve({ data: null, error: null }),
    neq: () => b,
    not: () => b,
    order: () => b,
    select: () => b,
    single: async () => await Promise.resolve({ data: null, error: null }),
    then: async (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      await Promise.resolve({ data: null, error: null }).then(onFulfilled),
    update: () => b,
    upsert: async () => await Promise.resolve({ data: null, error: null }),
  }
  return b
}

const realtimeChannel = function realtimeChannel() {
  const ch: unknown = {
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
  channel: () => {
    watcherState.channelCreationCount += 1
    return realtimeChannel()
  },
  from: (table: string) => sbBuilder(table),
  removeChannel: () => 'ok' as const,
}

const loggerMock = {
  debug: () => {},
  error: (message: string, meta?: Record<string, unknown>) =>
    watcherState.loggerErrorCalls.push({ message, meta: meta ?? {} }),
  info: (message: string, meta?: Record<string, unknown>) =>
    watcherState.loggerInfoCalls.push({ message, meta: meta ?? {} }),
  warn: () => {},
}

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    supabase: supabaseMock,
    logger: loggerMock,
    // Twurple auth provider — watcher's UPDATE:accounts handler calls
    // removeUser when the token is refreshed.
    getAuthProvider: () => ({ removeUser: () => {} }),
    getTwitchAPI: async () => await Promise.resolve({}),
  })
)

// Mock clearCacheForUser so we can assert it was called AND so the watcher
// test focuses on the watcher's invalidTokens management. Side effect mimics
// the real impl: removes the token from gsiHandlers. Does NOT touch
// invalidTokens — verified separately in clearCacheForUser.test.ts.
vi.doMock('../../dota/clear-cache-for-user', () => ({
  clearCacheForUser: async (client?: {
    token: string
    name?: string
    multiAccount?: number
    Account?: { providerAccountId?: string }
  }) => {
    if (!client) {
      return
    }
    watcherState.clearCacheCalls.push({
      accountId: client.Account?.providerAccountId,
      token: client.token,
    })
    client.multiAccount = undefined
    const { gsiHandlers, twitchIdToToken, twitchNameToToken } =
      await import('../../dota/lib/consts')
    const handler = gsiHandlers.get(client.token)
    if (handler) {
      handler.multiAccountRevalidatedAt = undefined
    }
    if (
      client.Account?.providerAccountId !== undefined &&
      client.Account.providerAccountId.length > 0
    ) {
      twitchIdToToken.delete(client.Account.providerAccountId)
    }
    if (client.name !== undefined && client.name.length > 0) {
      twitchNameToToken.delete(client.name)
    }
    gsiHandlers.delete(client.token)
    return true
  },
}))

// toggleDotabod fires on settings.commandDisable updates. Watcher unit tests
// don't exercise that path, but the import has to resolve.
vi.doMock(import('../../twitch/toggle-dotabod'), () => ({
  toggleDotabod: (userId: string, enable: boolean, name?: string, locale?: string) => {
    watcherState.toggleDotabodCalls.push({ enable, locale, name, userId })
  },
}))

// twitchChat is an EventEmitter wrapper around the steam socket; the watcher
// only .emit()s into it on commandDisable changes. Stub to a no-op emitter.
vi.doMock('../../steam/ws', () => ({
  steamSocket: { emit: () => {} },
  twitchChat: { emit: () => {} },
}))

vi.doMock('../../twitch/chat-client', () => ({
  chatClient: { say: async () => {} },
}))

// handleScheduledMessages / handleStreamStatusTransition / getDBUser are only
// reached by code paths our tests don't drive. Stub them so the import graph
// resolves without dragging in their transitive dependencies.
vi.doMock('../handle-scheduled-messages', () => ({
  handleUserOnlineMessages: async () => {},
}))

vi.doMock('../handle-stream-status-transition', () => ({
  handleStreamStatusTransition: ({
    client,
    oldStreamOnline,
  }: {
    client: { stream_online: boolean }
    oldStreamOnline: boolean
  }) => ({
    cameOnline: !oldStreamOnline && client.stream_online,
    wentOffline: oldStreamOnline && !client.stream_online,
  }),
}))

vi.doMock(import('../get-db-user'), () => ({
  default: async () => await Promise.resolve({ reason: 'stub', result: null }),
}))

vi.doMock('../../dota/lib/ranks', () => ({
  getRankDetail: async () => await Promise.resolve({}),
}))

vi.doMock('../../dota/server', () => ({
  server: {
    io: {
      to: (room: string) => ({
        emit: (event: string, payload: string) => {
          watcherState.socketEmits.push({ event, payload, room })
        },
      }),
    },
  },
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

export const startWatcher = function startWatcher() {
  const watcher = new SetupSupabase()
  watcher.init()
  return watcher
}

export const fire = async function fire(
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  table:
    | 'users'
    | 'accounts'
    | 'subscriptions'
    | 'settings'
    | 'win_loss_adjustments'
    | 'steam_accounts'
    | 'gift_subscriptions',
  payload: { new?: Record<string, unknown>; old?: Record<string, unknown>; eventType?: string }
) {
  const handler = watcherState.channelHandlers.get(`${event}:${table}`)
  if (!handler) {
    throw new Error(`no handler for ${event}:${table}`)
  }
  await handler(payload)
}

export const seedClient = function seedClient(opts: {
  userId: string
  token?: string
  name?: string
  providerAccountId?: string
  multiAccount?: number
  multiAccountRevalidatedAt?: number
  steamAccounts?: {
    mmr: number
    leaderboard_rank: number | null
    name: string | null
    steam32Id: number
  }[]
}) {
  const token = opts.token ?? opts.userId
  const client = createSocketClientStub({
    Account:
      opts.providerAccountId !== undefined && opts.providerAccountId.length > 0
        ? {
            access_token: '',
            expires_at: null,
            expires_in: null,
            obtainment_timestamp: null,
            providerAccountId: opts.providerAccountId,
            refresh_token: '',
            requires_refresh: false,
            scope: null,
          }
        : null,
    SteamAccount: opts.steamAccounts ?? [],
    multiAccount: opts.multiAccount,
    name: opts.name ?? `user-${opts.userId}`,
    settings: [],
    stream_online: false,
    stream_start_date: null,
    token,
  })
  const handler = createGsiHandlerStub(client, {
    disable: () => {},
    emitWLUpdate: vi.fn(),
    getChannelId: () => '',
    multiAccountRevalidatedAt: opts.multiAccountRevalidatedAt,
  })
  gsiHandlers.set(token, handler)
  if (opts.providerAccountId !== undefined && opts.providerAccountId.length > 0) {
    twitchIdToToken.set(opts.providerAccountId, token)
  }
  if (client.name.length > 0) {
    twitchNameToToken.set(client.name, token)
  }
  return { client, handler }
}

export const resetCaches = function resetCaches() {
  gsiHandlers.clear()
  invalidTokens.clear()
  twitchIdToToken.clear()
  twitchNameToToken.clear()
}
