// Shared test harness for the `__tests__` folder. Filename is intentionally
// NOT `.test.ts` so bun's runner doesn't try to execute it.
//
// Both `resolveMatch.test.ts` and `CommandHandler.integration.test.ts` import
// this module so they share a single `mock.module()` factory and a single
// state closure. Defining the harness once avoids races where two test files
// register competing factories for the same module spec.
import { mock } from 'bun:test'
import type { Database } from '@dotabod/shared-utils'
import { buildSharedUtilsMock, initTestI18n, PRO_SUB } from '../../../__tests__/sharedMocks.ts'

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

export type OpenDotaProfile = {
  rank_tier: number
  leaderboard_rank: number
} | null

export type GroupedBet = Database['public']['Functions']['get_grouped_bets']['Returns'][0]

export const state: {
  sessionMatch: SessionMatchRow | null
  olderMatch: { id: string } | null
  recentMatch: { matchId: string } | null
  recentList: Array<{ matchId: string; hero_name: string | null; won: boolean }>
  redisGet: Record<string, string | null>
  redisDelCalls: string[]
  updateCalls: Array<{ values: Record<string, unknown>; whereId: string | null }>
  updateMmrCalls: Array<Record<string, unknown>>
  chatSayCalls: Array<{ channel: string; message: string; messageId?: string }>
  steamSocketResponse: { matches: unknown[] } | null
  steamSocketError: unknown
  predictions: Prediction[]
  resolvePredictionCalls: Array<{ twitchId: string; predictionId: string; outcomeId: string }>
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
} = {
  sessionMatch: null,
  olderMatch: null,
  recentMatch: null,
  recentList: [],
  redisGet: {},
  redisDelCalls: [],
  updateCalls: [],
  updateMmrCalls: [],
  chatSayCalls: [],
  steamSocketResponse: null,
  steamSocketError: null,
  predictions: [],
  resolvePredictionCalls: [],
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
}

export function resetState() {
  state.sessionMatch = null
  state.olderMatch = null
  state.recentMatch = null
  state.recentList = []
  state.redisGet = {}
  state.redisDelCalls = []
  state.updateCalls = []
  state.updateMmrCalls = []
  state.chatSayCalls = []
  state.steamSocketResponse = null
  state.steamSocketError = null
  state.predictions = []
  state.resolvePredictionCalls = []
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
}

// Supabase chainable mock. Three query shapes need to be distinguished:
//   - findSessionMatch in-window:        uses .gte, not .not    → state.sessionMatch
//   - findSessionMatch fallback:         no .gte, no .not       → state.olderMatch
//   - findMostRecentResolvedMatch:       uses .not('won', ...)  → state.recentMatch
function createSupabaseFromBuilder() {
  let hasGte = false
  let hasNot = false
  let neqMatchId: string | null = null
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
    not: () => {
      hasNot = true
      return builder
    },
    neq: (col: string, val: string) => {
      if (col === 'matchId') neqMatchId = val
      return builder
    },
    order: () => builder,
    // `.limit()` is the terminal call for list queries (e.g. !recent) which
    // await the chain directly. It's also followed by `.single()` for
    // findMostRecentResolvedMatch. Return a hybrid object that's both
    // thenable (resolving to a list) and exposes `.single()` for the row case.
    limit: () => ({
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock
      then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: state.recentList, error: null }).then(onFulfilled),
      single: async () => {
        if (state.recentMatch && state.recentMatch.matchId === neqMatchId) {
          return { data: null, error: { message: 'excluded' } }
        }
        return state.recentMatch
          ? { data: state.recentMatch, error: null }
          : { data: null, error: { message: 'not found' } }
      },
    }),
    single: async () => {
      if (hasNot) {
        if (state.recentMatch && state.recentMatch.matchId === neqMatchId) {
          return { data: null, error: { message: 'excluded' } }
        }
        return state.recentMatch
          ? { data: state.recentMatch, error: null }
          : { data: null, error: { message: 'not found' } }
      }
      if (hasGte) {
        return state.sessionMatch
          ? { data: state.sessionMatch, error: null }
          : { data: null, error: { message: 'not found' } }
      }
      return state.olderMatch
        ? { data: state.olderMatch, error: null }
        : { data: null, error: { message: 'not found' } }
    },
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
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

const getTwitchAPIMock = async () => ({
  predictions: {
    getPredictions: async () => ({ data: state.predictions }),
    resolvePrediction: async (twitchId: string, predictionId: string, outcomeId: string) => {
      state.resolvePredictionCalls.push({ twitchId, predictionId, outcomeId })
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

mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    supabase: supabaseMock,
    logger: loggerMock,
    getTwitchAPI: getTwitchAPIMock,
    checkBotStatus: async () => state.botBanned,
  }),
)

mock.module('../../../dota/lib/updateMmr.js', () => ({
  updateMmr: async (args: Record<string, unknown>) => {
    state.updateMmrCalls.push(args)
  },
  tellChatNewMMR: () => undefined,
}))

// Mock only the network-touching functions in ranks.js. The rest
// (rankTierToMmr, mmrToRankTier, etc.) are pure helpers used elsewhere in
// the dota source, so we re-export them as-is from the real module.
const realRanks = await import('../../../dota/lib/ranks.js')
mock.module('../../../dota/lib/ranks.js', () => ({
  ...realRanks,
  getOpenDotaProfile: async () => state.openDotaProfile,
  getRankTitle: () => state.rankTitle,
  getRankDescription: async () => state.rankDescription,
}))

await initTestI18n()

// Import after all module mocks are registered.
const resolveMatchModule = await import('../resolveMatch.js')
export const resolveMatchRetroactively = resolveMatchModule.resolveMatchRetroactively
export const findMostRecentResolvedMatch = resolveMatchModule.findMostRecentResolvedMatch
const { gsiHandlers } = await import('../../../dota/lib/consts.js')
const { steamSocket } = await import('../../../steam/ws.js')
const { chatClient } = await import('../../chatClient.js')
const { redisClient } = await import('../../../db/redisInstance.js')
export const commandHandler = (await import('../CommandHandler.js')).default
// Side-effect imports register the commands with the singleton handler.
await import('../../commands/recent.js')
await import('../../commands/won.js')
await import('../../commands/lost.js')
await import('../../commands/ping.js')
await import('../../commands/locale.js')
await import('../../commands/delay.js')
await import('../../commands/wl.js')
await import('../../commands/mmr.js')
await import('../../commands/gpm.js')
await import('../../commands/dotabuff.js')
await import('../../commands/pleb.js')
await import('../../commands/apm.js')
await import('../../commands/avg.js')

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
}

const fakeGsiHandler = {
  getChannelId: () => state.channelId,
  emitWLUpdate: () => {
    state.emitWLUpdateCalls += 1
  },
} as any
gsiHandlers.set('token-abc', fakeGsiHandler)

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
