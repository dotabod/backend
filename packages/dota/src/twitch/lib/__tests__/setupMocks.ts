// Shared test harness for the `__tests__` folder. Filename is intentionally
// NOT `.test.ts` so bun's runner doesn't try to execute it.
//
// Both `resolveMatch.test.ts` and `CommandHandler.integration.test.ts` import
// this module so they share a single `mock.module()` factory and a single
// state closure. Defining the harness once avoids races where two test files
// register competing factories for the same module spec.
import { mock } from 'bun:test'
import type { Database } from '@dotabod/shared-utils'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../__tests__/sharedMocks'

export { PRO_SUB }

export type SessionMatchRow = {
  id: string
  matchId: string
  myTeam: string
  predictionId: string | null
  steam32Id: number | null
  lobby_type: number | null
  is_party: boolean | null
  won: boolean | null
}

export type Prediction = {
  id: string
  status: 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED'
  outcomes: { id: string; users: number; title: string }[]
}

export type PredictionsCall = { twitchId: string; opts: { limit: number } }

export type OpenDotaProfile = {
  rank_tier: number
  leaderboard_rank: number
} | null

export type GroupedBet = Database['public']['Functions']['get_grouped_bets']['Returns'][0]

export const state: {
  sessionMatch: SessionMatchRow | null
  olderMatch: { id: string } | null
  recentList: Array<{ matchId: string; hero_name: string | null; won: boolean }>
  redisGet: Record<string, string | null>
  redisDelCalls: string[]
  updateCalls: Array<{ values: Record<string, unknown>; whereId: string | null }>
  upsertCalls: Array<{ values: Record<string, unknown>; options?: unknown }>
  updateMmrCalls: Array<Record<string, unknown>>
  chatSayCalls: Array<{ channel: string; message: string; messageId?: string }>
  steamSocketResponse: { matches: unknown[] } | null
  steamSocketError: unknown
  predictions: Prediction[]
  resolvePredictionCalls: Array<{ twitchId: string; predictionId: string; outcomeId: string }>
  cancelPredictionCalls: Array<{ twitchId: string; predictionId: string }>
  getPredictionsCalls: PredictionsCall[]
  getPredictionsError: unknown
  loggerErrorCalls: Array<{ message: string; meta: Record<string, unknown> }>
  emitWLUpdateCalls: number
  channelId: string | null
  loggerInfoCalls: Array<{ message: string; meta: Record<string, unknown> }>
  groupedBets: GroupedBet[]
  groupedBetsError: unknown
  openDotaProfile: OpenDotaProfile
  rankTitle: string
  rankDescription: string | null
  botBanned: boolean
  subscriberOnlyMode: boolean
  chatSettingsUpdates: Array<{ channelId: string; settings: Record<string, unknown> }>
  // Result returned by the mocked MongoDB `delayedGames` findOne (ranked, spectators, ...).
  delayedGame: Record<string, unknown> | null
} = {
  sessionMatch: null,
  olderMatch: null,
  recentList: [],
  redisGet: {},
  redisDelCalls: [],
  updateCalls: [],
  upsertCalls: [],
  updateMmrCalls: [],
  chatSayCalls: [],
  steamSocketResponse: null,
  steamSocketError: null,
  predictions: [],
  resolvePredictionCalls: [],
  cancelPredictionCalls: [],
  getPredictionsCalls: [],
  getPredictionsError: null,
  loggerErrorCalls: [],
  emitWLUpdateCalls: 0,
  channelId: null,
  loggerInfoCalls: [],
  groupedBets: [],
  groupedBetsError: null,
  openDotaProfile: null,
  rankTitle: 'Immortal',
  rankDescription: null,
  botBanned: false,
  subscriberOnlyMode: false,
  chatSettingsUpdates: [],
  delayedGame: null,
}

export function resetState() {
  state.sessionMatch = null
  state.olderMatch = null
  state.recentList = []
  state.redisGet = {}
  state.redisDelCalls = []
  state.updateCalls = []
  state.upsertCalls = []
  state.updateMmrCalls = []
  state.chatSayCalls = []
  state.steamSocketResponse = null
  state.steamSocketError = null
  state.predictions = []
  state.resolvePredictionCalls = []
  state.cancelPredictionCalls = []
  state.getPredictionsCalls = []
  state.getPredictionsError = null
  state.loggerErrorCalls = []
  state.emitWLUpdateCalls = 0
  state.channelId = null
  state.loggerInfoCalls = []
  state.groupedBets = []
  state.groupedBetsError = null
  state.openDotaProfile = null
  state.rankTitle = 'Immortal'
  state.rankDescription = null
  state.botBanned = false
  state.subscriberOnlyMode = false
  state.chatSettingsUpdates = []
  state.delayedGame = null
  // Re-assert all module mocks (shared-utils, updateMmr, ranks, MongoDBSingleton)
  // in case a sibling test file replaced any of them since the last test ran.
  reinstallModuleMocks()
  // Re-assert singleton patches; gsiMocks.ts also patches these in its own
  // installGsiMocks() and whichever ran last wins — reasserting here ensures
  // twitch tests own the bindings regardless of file-discovery order.
  installTwitchMocks()
}

// Supabase chainable mock. Three query shapes need to be distinguished:
//   - findSessionMatch in-window:        uses .gte, ends with .single()  → state.sessionMatch
//   - findSessionMatch fallback:         no .gte, ends with .single()    → state.olderMatch
//   - findResolvedMatchesInSession:      uses .limit(), awaited directly → state.recentList
function createSupabaseFromBuilder() {
  let hasGte = false
  let mode: 'select' | 'update' | null = null
  let updateValues: Record<string, unknown> = {}
  let updateWhereId: string | null = null

  const builder: any = {
    select: () => {
      mode = 'select'
      return builder
    },
    update: (values: Record<string, unknown>) => {
      mode = 'update'
      updateValues = values
      return builder
    },
    upsert: (values: Record<string, unknown>, options?: unknown) => {
      state.upsertCalls.push({ values, options })
      return Promise.resolve({ data: null, error: null })
    },
    eq: (col: string, val: string) => {
      if (mode === 'update' && col === 'id') {
        updateWhereId = val
        state.updateCalls.push({ values: updateValues, whereId: updateWhereId })
        return Promise.resolve({ data: null, error: null })
      }
      return builder
    },
    gte: () => {
      hasGte = true
      return builder
    },
    is: () => builder,
    not: () => builder,
    neq: () => builder,
    order: () => builder,
    // `.limit()` is the terminal call for list queries (e.g. !recent, the
    // won/lost fallback). The result is awaited directly.
    limit: () => ({
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
      then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: state.recentList, error: null }).then(onFulfilled),
    }),
    single: async () => {
      if (hasGte) {
        return state.sessionMatch
          ? { data: state.sessionMatch, error: null }
          : { data: null, error: { message: 'not found' } }
      }
      return state.olderMatch
        ? { data: state.olderMatch, error: null }
        : { data: null, error: { message: 'not found' } }
    },
    // Terminal for chains awaited directly without .limit()/.single() (e.g.
    // getTodayHeroStats ends in .order()). Resolves the list result.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: state.recentList, error: null }).then(onFulfilled),
  }

  return builder
}

const supabaseMock = {
  from: () => createSupabaseFromBuilder(),
  rpc: async () => {
    if (state.groupedBetsError) {
      return { data: null, error: state.groupedBetsError }
    }
    return { data: state.groupedBets, error: null }
  },
}

const loggerMock = {
  info: (message: string, meta?: Record<string, unknown>) => {
    state.loggerInfoCalls.push({ message, meta: meta ?? {} })
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    state.loggerErrorCalls.push({ message, meta: meta ?? {} })
  },
  warn: () => undefined,
  debug: () => undefined,
}

const getTwitchAPIMock = async () => ({
  streams: {
    createStreamMarker: async () => ({}),
  },
  predictions: {
    getPredictions: async (twitchId: string, opts: { limit: number }) => {
      state.getPredictionsCalls.push({ twitchId, opts })
      if (state.getPredictionsError) throw state.getPredictionsError
      return { data: state.predictions }
    },
    resolvePrediction: async (twitchId: string, predictionId: string, outcomeId: string) => {
      state.resolvePredictionCalls.push({ twitchId, predictionId, outcomeId })
      return {}
    },
    cancelPrediction: async (twitchId: string, predictionId: string) => {
      state.cancelPredictionCalls.push({ twitchId, predictionId })
      return {}
    },
  },
  asUser: async (
    _twitchId: string,
    cb: (ctx: {
      chat: {
        getSettings: (channelId: string) => Promise<{ subscriberOnlyModeEnabled: boolean }>
        updateSettings: (channelId: string, settings: Record<string, unknown>) => Promise<void>
      }
    }) => unknown,
  ) =>
    cb({
      chat: {
        getSettings: async () => ({ subscriberOnlyModeEnabled: state.subscriberOnlyMode }),
        updateSettings: async (channelId: string, settings: Record<string, unknown>) => {
          state.chatSettingsUpdates.push({ channelId, settings })
        },
      },
    }),
})

const realRanks = await import('../../../dota/lib/ranks')

// bun's `mock.module` registry is global and last-write-wins, and the
// `@dotabod/shared-utils` exports (supabase, getTwitchAPI) are *live bindings*
// resolved at call time. Sibling test files register their own narrower mocks
// (e.g. `supabase: {}`); if one of those is the last registration before our
// suite's tests run, our handlers resolve a degenerate supabase/api and crash.
// `resetState()` re-asserts this from every suite's `beforeEach`, so the
// complete shared-utils surface is guaranteed active whenever our tests run,
// independent of the file-discovery order bun happens to pick. Scoped to
// shared-utils only — re-registering the modules below in `beforeEach` could
// clobber sibling harnesses (gsiMocks) that mock the same specs differently.
function reinstallSharedUtilsMock() {
  mock.module('@dotabod/shared-utils', () =>
    buildSharedUtilsMock({
      supabase: supabaseMock,
      logger: loggerMock,
      getTwitchAPI: getTwitchAPIMock,
      checkBotStatus: async () => state.botBanned,
    }),
  )
}

function reinstallModuleMocks() {
  reinstallSharedUtilsMock()

  mock.module('../../../dota/lib/updateMmr', () => ({
    updateMmr: async (args: Record<string, unknown>) => {
      state.updateMmrCalls.push(args)
    },
    tellChatNewMMR: () => undefined,
  }))

  // Mock only the network-touching functions in ranks.js. The rest
  // (rankTierToMmr, mmrToRankTier, etc.) are pure helpers used elsewhere in
  // the dota source, so we re-export them as-is from the real module.
  mock.module('../../../dota/lib/ranks', () => ({
    ...realRanks,
    getOpenDotaProfile: async () => state.openDotaProfile,
    getRankTitle: () => state.rankTitle,
    getRankDescription: async () => state.rankDescription,
  }))

  // Mongo is only used by a few match-data commands (ranked, spectators, ...).
  // connect() yields a db whose delayedGames.findOne returns state.delayedGame.
  mock.module('../../../steam/MongoDBSingleton', () => ({
    default: {
      connect: async () => ({
        collection: () => ({
          findOne: async () => state.delayedGame,
        }),
      }),
      close: async () => undefined,
    },
  }))
}

reinstallModuleMocks()

await initTestI18n()

// Import after all module mocks are registered.
const resolveMatchModule = await import('../resolveMatch')
export const resolveMatchRetroactively = resolveMatchModule.resolveMatchRetroactively
export const findMostRecentResolvedMatch = resolveMatchModule.findMostRecentResolvedMatch
export const { closeTwitchBet } = await import('../closeTwitchBet')
export const { refundTwitchBet } = await import('../refundTwitchBets')
const { gsiHandlers } = await import('../../../dota/lib/consts')
const { steamSocket } = await import('../../../steam/ws')
const { chatClient } = await import('../../chatClient')
const { redisClient } = await import('../../../db/redisInstance')
export const commandHandler = (await import('../CommandHandler')).default
// Side-effect imports register the commands with the singleton handler.
await import('../../commands/recent')
await import('../../commands/won')
await import('../../commands/lost')
await import('../../commands/ping')
await import('../../commands/locale')
await import('../../commands/delay')
await import('../../commands/wl')
await import('../../commands/mmr')
await import('../../commands/gpm')
await import('../../commands/dotabuff')
await import('../../commands/pleb')
await import('../../commands/apm')
await import('../../commands/avg')
await import('../../commands/version')
await import('../../commands/commands')
await import('../../commands/dotabod')
await import('../../commands/steam')
await import('../../commands/song')
await import('../../commands/match')
await import('../../commands/xpm')
await import('../../commands/aghs')
await import('../../commands/shard')
await import('../../commands/d2pt')
await import('../../commands/innate')
await import('../../commands/mmr=')
await import('../../commands/modsonly')
await import('../../commands/only')
await import('../../commands/setdelay')
await import('../../commands/mute')
await import('../../commands/ranked')
await import('../../commands/spectators')
await import('../../commands/friends')
await import('../../commands/opendota')
await import('../../commands/profile')
await import('../../commands/beta')
await import('../../commands/toggle')
await import('../../commands/today')
await import('../../commands/clearsharing')
await import('../../commands/lgs')
await import('../../commands/items')
await import('../../commands/stats')
await import('../../commands/geo')
await import('../../commands/gm')
await import('../../commands/np')
await import('../../commands/smurfs')
await import('../../commands/lg')
await import('../../commands/count')
await import('../../commands/refresh')
await import('../../commands/online')
await import('../../commands/resetwl')
await import('../../commands/hero')
await import('../../commands/fixparty')
await import('../../commands/fixdbl')
await import('../../commands/winprobability')
await import('../../commands/unresolved')

// Monkey-patch the singletons we need behavior control over. Mocking these
// modules wholesale would force us to enumerate every other transitive export.
steamSocket.emit = ((
  _event: string,
  _args: unknown,
  cb: (err: unknown, response: unknown) => void,
) => {
  if (state.steamSocketError) {
    cb(state.steamSocketError, null)
    return
  }
  cb(null, state.steamSocketResponse ?? { matches: [] })
}) as any

const fakeGsiHandler = {
  getChannelId: () => state.channelId,
  emitWLUpdate: () => {
    state.emitWLUpdateCalls += 1
  },
} as any
gsiHandlers.set('token-abc', fakeGsiHandler)

const { server } = await import('../../../dota/server')

// Re-assert chatClient / redisClient / server patches each time. gsiMocks.ts
// also monkey-patches these singletons in its installGsiMocks(); whichever
// harness loaded last wins. Calling this in resetState() (which every twitch
// test calls in beforeEach) guarantees the twitch patches are active.
export function installTwitchMocks() {
  chatClient.say = (async (channel: string, message: string, messageId?: string) => {
    state.chatSayCalls.push({ channel, message, messageId })
  }) as any

  ;(redisClient as any).client = {
    get: async (key: string) => state.redisGet[key] ?? null,
    set: async () => 'OK',
    del: async (key: string) => {
      state.redisDelCalls.push(key)
      return 1
    },
    json: {
      get: async () => null,
      set: async () => 'OK',
    },
  }

  // Inject a stub socket.io server so commands that talk to the overlay
  // (count, refresh, online, resetwl, hero) don't throw "Server not initialized".
  // fetchSockets returns [] so overlay-dependent paths take their empty branch.
  server.setServer({
    io: {
      to: () => ({ emit: () => undefined }),
      in: () => ({ fetchSockets: async () => [] }),
      fetchSockets: async () => [],
    },
  } as any)

  // Re-register the fake gsi handler; getDBUser.test.ts calls gsiHandlers.clear()
  // in its beforeEach, which wipes this entry and makes `!hero` fall through to
  // "not playing" (the command guards on gsiHandlers.get(token) being truthy).
  gsiHandlers.set('token-abc', fakeGsiHandler)
}

installTwitchMocks()

export type Client = Parameters<typeof resolveMatchRetroactively>[0]

export function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    name: 'streamer',
    token: 'token-abc',
    stream_online: true,
    stream_start_date: new Date('2026-05-19T08:00:00Z'),
    beta_tester: false,
    locale: 'en',
    steam32Id: 99999,
    mmr: 5000,
    Account: {
      requires_refresh: false,
      refresh_token: '',
      access_token: '',
      expires_at: null,
      scope: null,
      obtainment_timestamp: null,
      expires_in: null,
      providerAccountId: 'twitch-channel-1',
    },
    SteamAccount: [],
    settings: [],
    gsi: undefined,
    ...overrides,
  } as Client
}

export const baseMatchRow = (overrides: Partial<SessionMatchRow> = {}): SessionMatchRow => ({
  id: 'row-uuid-1',
  matchId: '7777777777',
  myTeam: 'radiant',
  predictionId: 'pred-1',
  steam32Id: 99999,
  lobby_type: 7,
  is_party: false,
  won: null,
  ...overrides,
})

// A minimal "in a live match as your own hero" GSI packet. `extra` shallow-
// merges so callers can override player/hero (e.g. set player.xpm).
export const liveGsi = (extra: Record<string, unknown> = {}) =>
  ({
    map: { matchid: '7777777777' },
    player: { accountid: 99999 },
    hero: { id: 1 },
    ...extra,
  }) as any

export function makeMessage({
  content,
  permission = 2,
  channelId = 'channel-1',
  userName = 'modUser',
  clientOverrides = {},
}: {
  content: string
  permission?: number
  channelId?: string
  userName?: string
  clientOverrides?: Partial<Client>
}) {
  const client = makeClient({ subscription: PRO_SUB, ...clientOverrides })
  return {
    user: { name: userName, messageId: 'msg-1', permission, userId: 'user-1' },
    content,
    channel: { name: '#streamer', id: channelId, client, settings: client.settings },
  }
}
