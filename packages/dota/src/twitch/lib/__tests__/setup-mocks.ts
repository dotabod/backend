import type { Database, Json } from '@dotabod/shared-utils'
// Shared test harness for the `__tests__` folder. Filename is intentionally
// NOT `.test.ts` so bun's runner doesn't try to execute it.
//
// Both `resolveMatch.test.ts` and `CommandHandler.integration.test.ts` import
// this module so they share a single `vi.doMock()` factory and a single
// state closure. Defining the harness once avoids races where two test files
// register competing factories for the same module spec.
import { vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createPacketStub,
  createSocketClientStub,
  initTestI18n,
  PRO_SUB as SHARED_PRO_SUB,
} from '../../../__tests__/shared-mocks'
import type { GSIHandlerType } from '../../../dota/gsi-handler-types'
import type { UpdateMmrParams } from '../../../dota/lib/update-mmr'
import type { MessageType } from '../command-handler'

type SharedUtilsMockOptions = Parameters<typeof buildSharedUtilsMock>[0]
type LoggerMetadata = NonNullable<Parameters<SharedUtilsMockOptions['logger']['info']>[1]>
type TrackDisableMetadata = NonNullable<
  Parameters<NonNullable<SharedUtilsMockOptions['trackDisableReason']>>[3]
>
type NotificationMetadata = NonNullable<
  Parameters<NonNullable<SharedUtilsMockOptions['recordDisableNotification']>>[3]
>
type CommandDisableMetadata = NonNullable<
  Parameters<NonNullable<SharedUtilsMockOptions['commandDisable']>['disable']>[2]
>

export const PRO_SUB = SHARED_PRO_SUB

export interface SessionMatchRow {
  dire_score?: number
  game_mode?: number
  id: string
  matchId: string
  myTeam: string
  predictionId: string | null
  radiant_score?: number
  steam32Id: number | null
  lobby_type: number | null
  is_party: boolean | null
  won: boolean | null
}

export interface Prediction {
  id: string
  status: string
  outcomes: { id: string; users: number; title: string }[]
}

export interface PredictionsCall {
  twitchId: string
  opts: { limit: number }
}

export type DotabodRankProfile = {
  rank_tier: number
  leaderboard_rank: number
} | null

export type GroupedBet = Database['public']['Functions']['get_grouped_bets']['Returns'][0]

type GroupedBetsArgs = Database['public']['Functions']['get_grouped_bets']['Args']

interface QueryError {
  message: string
}

interface MutationValues {
  beta_tester?: boolean
  dire_score?: number | null
  game_mode?: number | null
  is_doubledown?: boolean
  is_party?: boolean
  key?: string
  lobby_type?: number | null
  radiant_score?: number | null
  requires_refresh?: boolean
  stream_online?: boolean
  stream_start_date?: string | null
  updated_at?: string
  userId?: string
  value?: Json
  won?: boolean | null
}

interface UpsertOptions {
  onConflict?: string
}

interface TwitchChatSettings {
  emoteOnlyModeEnabled?: boolean
  subscriberOnlyModeEnabled: boolean
}

interface DelayedGameMatchFixture {
  game_mode?: number
  lobby_type?: number
  match_id?: string
  server_steam_id?: string
}

interface DelayedGamePlayerFixture {
  accountid: number | string
  heroid: number
  player_name?: string
}

interface DelayedGameFixture {
  average_mmr?: number
  match?: DelayedGameMatchFixture
  players?: DelayedGamePlayerFixture[]
  spectators?: number
}

interface SteamMatchFixture {
  dire_score?: number
  game_mode?: number
  lobby_type?: number
  radiant_score?: number
}

interface SteamRealtimePlayerFixture {
  accountid: number
  assists_count?: number
  death_count?: number
  denies_count?: number
  gold?: number
  items?: number[]
  kill_count?: number
  level?: number
  lh_count?: number
  net_worth?: number
  team_slot: number
}

interface SteamSocketResponse {
  last_match?: unknown
  match?: DelayedGameMatchFixture
  matches?: SteamMatchFixture[]
  teams?: { players: SteamRealtimePlayerFixture[] }[]
}

interface SteamPlayerSummaryFixture {
  account_id: number
  country_code: string | null
  persona_name: string | null
}

type SteamSocketCallback = (
  error: Error | string | null,
  response: SteamSocketResponse | SteamPlayerSummaryFixture[] | null
) => void

type SteamSocketEmitArguments = [event: string, args: Json, callback: SteamSocketCallback]

interface RecentMatchesQueryResult {
  data: TwitchHarnessState['recentList']
  error: null
}

interface SingleQueryResult {
  data: SessionMatchRow | { id: string } | null
  error: QueryError | null
}

interface SupabaseBuilder {
  eq: (column: string, value: string) => SupabaseBuilder
  gte: (column: string, value: string) => SupabaseBuilder
  in: () => SupabaseBuilder
  is: () => SupabaseBuilder
  limit: () => Promise<RecentMatchesQueryResult>
  neq: () => SupabaseBuilder
  not: () => SupabaseBuilder
  order: () => SupabaseBuilder
  select: () => SupabaseBuilder
  single: () => Promise<SingleQueryResult>
  update: (values: MutationValues) => SupabaseBuilder
  upsert: (values: MutationValues, options?: UpsertOptions) => Promise<{ data: null; error: null }>
}

interface TwitchHarnessState {
  sessionMatch: SessionMatchRow | null
  olderMatch: { id: string } | null
  recentList: { matchId: string; hero_name: string | null; won: boolean }[]
  redisGet: Record<string, string | null>
  redisDelCalls: string[]
  updateCalls: { values: MutationValues; whereId: string | null }[]
  upsertCalls: { values: MutationValues; options?: UpsertOptions }[]
  updateMmrCalls: UpdateMmrParams[]
  chatSayCalls: { channel: string; message: string; messageId?: string }[]
  closeBetsCalls: Parameters<GSIHandlerType['closeBets']>[]
  socketEmitCalls: { room: string; event: string; args: unknown[] }[]
  streamStatusEffectCalls: ('socket' | 'update')[]
  steamSocketResponse: SteamSocketResponse | null
  steamSocketError: Error | null
  steamPlayerSummaries: SteamPlayerSummaryFixture[]
  predictions: Prediction[]
  resolvePredictionCalls: {
    twitchId: string
    predictionId: string
    outcomeId: string
  }[]
  cancelPredictionCalls: { twitchId: string; predictionId: string }[]
  createPredictionCalls: {
    twitchId: string
    opts: { title: string; outcomes: string[]; autoLockAfter: number }
  }[]
  // When set, the mocked createPrediction throws this instead of succeeding —
  // simulates a Twitch API failure (e.g. an HttpStatusCodeError with a JSON `.body`).
  createPredictionError: Error | null
  getPredictionsCalls: PredictionsCall[]
  getPredictionsError: Error | null
  // When > 0, the next N getPredictions calls throw a transient
  // ERR_STREAM_PREMATURE_CLOSE before one finally succeeds — exercises the
  // retryTransient wrapper around the Twitch predictions API.
  getPredictionsTransientFailures: number
  loggerErrorCalls: { message: string; meta: LoggerMetadata }[]
  emitWLUpdateCalls: number
  channelId: string | null
  loggerInfoCalls: { message: string; meta: LoggerMetadata }[]
  groupedBets: GroupedBet[]
  groupedBetsError: QueryError | null
  rpcCalls: { name: string; args: GroupedBetsArgs }[]
  gteCalls: { column: string; value: string }[]
  dotabodRankProfile: DotabodRankProfile
  rankTitle: string
  rankDescription: string | null
  botBanned: boolean
  subscriberOnlyMode: boolean
  chatSettingsUpdates: {
    channelId: string
    settings: TwitchChatSettings
  }[]
  // Result returned by the mocked MongoDB `delayedGames` findOne (ranked, spectators, ...).
  delayedGame: DelayedGameFixture | null
  notablePlayers: { account_id: number; name: string; country_code: string }[]
  // Optional override for the mocked `moderateText` — return a custom redacted
  // string. Default passthrough returns the input as-is.
  moderateTextOverride: ((text?: string | string[]) => string | string[] | undefined) | null
  trackDisableReasonCalls: {
    userId: string
    settingKey: string
    reason: string
    metadata?: TrackDisableMetadata
    opts?: { disabledValue?: boolean }
  }[]
  trackResolveReasonCalls: {
    userId: string
    settingKey: string
    autoResolved?: boolean
    opts?: { reason?: string; enabledValue?: boolean }
  }[]
  recordDisableNotificationCalls: {
    userId: string
    settingKey: string
    reason: string
    metadata?: NotificationMetadata
  }[]
  resolveDisableNotificationCalls: {
    userId: string
    settingKey: string
    opts?: { reason?: string; autoResolved?: boolean }
  }[]
  commandDisableCalls: (
    | {
        kind: 'disable'
        userId: string
        reason: string
        metadata?: CommandDisableMetadata
      }
    | {
        kind: 'enable'
        userId: string
        opts?: { reason?: string; autoResolved?: boolean }
      }
    | {
        kind: 'recordNotification'
        userId: string
        reason: string
        metadata?: CommandDisableMetadata
      }
  )[]
}

export const state: TwitchHarnessState = {
  botBanned: false,
  cancelPredictionCalls: [],
  channelId: null,
  chatSayCalls: [],
  chatSettingsUpdates: [],
  closeBetsCalls: [],
  commandDisableCalls: [],
  createPredictionCalls: [],
  createPredictionError: null,
  delayedGame: null,
  dotabodRankProfile: null,
  emitWLUpdateCalls: 0,
  getPredictionsCalls: [],
  getPredictionsError: null,
  getPredictionsTransientFailures: 0,
  groupedBets: [],
  groupedBetsError: null,
  gteCalls: [],
  loggerErrorCalls: [],
  loggerInfoCalls: [],
  moderateTextOverride: null,
  notablePlayers: [],
  olderMatch: null,
  predictions: [],
  rankDescription: null,
  rankTitle: 'Immortal',
  recentList: [],
  recordDisableNotificationCalls: [],
  redisDelCalls: [],
  redisGet: {},
  resolveDisableNotificationCalls: [],
  resolvePredictionCalls: [],
  rpcCalls: [],
  sessionMatch: null,
  socketEmitCalls: [],
  steamPlayerSummaries: [],
  steamSocketError: null,
  steamSocketResponse: null,
  streamStatusEffectCalls: [],
  subscriberOnlyMode: false,
  trackDisableReasonCalls: [],
  trackResolveReasonCalls: [],
  updateCalls: [],
  updateMmrCalls: [],
  upsertCalls: [],
}

// Supabase chainable mock. Three query shapes need to be distinguished:
//   - findSessionMatch in-window:        uses .gte, ends with .single()  → state.sessionMatch
//   - findSessionMatch fallback:         no .gte, ends with .single()    → state.olderMatch
//   - findResolvedMatchesInSession:      uses .limit(), awaited directly → state.recentList
const createSupabaseFromBuilder = function createSupabaseFromBuilder(): SupabaseBuilder {
  let hasGte = false
  let mode: 'select' | 'update' | null = null
  let updateValues: MutationValues = {}
  let updateWhereId: string | null = null

  const builder: SupabaseBuilder = Object.assign(
    Promise.resolve({ data: state.recentList, error: null }),
    {
      eq: (col: string, val: string) => {
        if (mode === 'update' && col === 'id') {
          updateWhereId = val
          state.updateCalls.push({
            values: updateValues,
            whereId: updateWhereId,
          })
          state.streamStatusEffectCalls.push('update')
        }
        return builder
      },
      gte: (column: string, value: string) => {
        hasGte = true
        state.gteCalls.push({ column, value })
        return builder
      },
      in: () => builder,
      is: () => builder,
      limit: async () => await Promise.resolve({ data: state.recentList, error: null }),
      neq: () => builder,
      not: () => builder,
      order: () => builder,
      select: () => {
        mode = 'select'
        return builder
      },
      single: async () => {
        if (hasGte) {
          return await Promise.resolve(
            state.sessionMatch
              ? { data: state.sessionMatch, error: null }
              : { data: null, error: { message: 'not found' } }
          )
        }
        return await Promise.resolve(
          state.olderMatch
            ? { data: state.olderMatch, error: null }
            : { data: null, error: { message: 'not found' } }
        )
      },
      update: (values: MutationValues) => {
        mode = 'update'
        updateValues = values
        return builder
      },
      upsert: async (values: MutationValues, options?: UpsertOptions) => {
        state.upsertCalls.push({ options, values })
        return await Promise.resolve({ data: null, error: null })
      },
    }
  )

  return builder
}

const supabaseMock = {
  from: () => createSupabaseFromBuilder(),
  rpc: async (name: string, args: GroupedBetsArgs) => {
    state.rpcCalls.push({ args, name })
    if (state.groupedBetsError !== null && state.groupedBetsError !== undefined) {
      return await Promise.resolve({ data: null, error: state.groupedBetsError })
    }
    return await Promise.resolve({ data: state.groupedBets, error: null })
  },
}

const loggerMock = {
  debug: () => {},
  error: (message: string, meta?: LoggerMetadata) => {
    state.loggerErrorCalls.push({ message, meta: meta ?? {} })
  },
  info: (message: string, meta?: LoggerMetadata) => {
    state.loggerInfoCalls.push({ message, meta: meta ?? {} })
  },
  warn: () => {},
}

interface TwitchApiContext {
  chat: {
    getSettings: (channelId: string) => Promise<TwitchChatSettings>
    updateSettings: (channelId: string, settings: TwitchChatSettings) => Promise<void>
  }
}

const getTwitchAPIMock = async () =>
  await Promise.resolve({
    asUser: async <Result>(
      _twitchId: string,
      runAsUser: (ctx: TwitchApiContext) => Promise<Result>
    ): Promise<Result> =>
      await runAsUser({
        chat: {
          getSettings: async () =>
            await Promise.resolve({ subscriberOnlyModeEnabled: state.subscriberOnlyMode }),
          updateSettings: async (channelId: string, settings: TwitchChatSettings) => {
            state.chatSettingsUpdates.push({ channelId, settings })
            await Promise.resolve()
          },
        },
      }),
    predictions: {
      cancelPrediction: async (twitchId: string, predictionId: string) => {
        state.cancelPredictionCalls.push({ predictionId, twitchId })
        return await Promise.resolve({})
      },
      createPrediction: async (
        twitchId: string,
        opts: { title: string; outcomes: string[]; autoLockAfter: number }
      ) => {
        state.createPredictionCalls.push({ opts, twitchId })
        if (state.createPredictionError !== null) {
          throw state.createPredictionError
        }
        return await Promise.resolve({ id: 'new-prediction-id' })
      },
      getPredictions: async (twitchId: string, opts: { limit: number }) => {
        state.getPredictionsCalls.push({ opts, twitchId })
        if (state.getPredictionsTransientFailures > 0) {
          state.getPredictionsTransientFailures -= 1
          const error = Object.assign(
            new Error(
              'Invalid response body while trying to fetch https://api.twitch.tv/helix/predictions: Premature close'
            ),
            { code: 'ERR_STREAM_PREMATURE_CLOSE' }
          )
          throw error
        }
        if (state.getPredictionsError !== null) {
          throw state.getPredictionsError
        }
        return await Promise.resolve({ data: state.predictions })
      },
      resolvePrediction: async (twitchId: string, predictionId: string, outcomeId: string) => {
        state.resolvePredictionCalls.push({ outcomeId, predictionId, twitchId })
        return await Promise.resolve({})
      },
    },
    streams: {
      createStreamMarker: async () => await Promise.resolve({}),
    },
  })

// Register the @dotabod/shared-utils mock BEFORE any dynamic import that
// might pull in modules whose static `import { supabase } from '@dotabod/shared-utils'`
// would otherwise resolve to the real module and get cached by vitest's module
// loader. Once cached, no later vi.doMock can replace it.
const reinstallSharedUtilsMock = function reinstallSharedUtilsMock() {
  vi.doMock('@dotabod/shared-utils', () =>
    buildSharedUtilsMock({
      checkBotStatus: async () => await Promise.resolve(state.botBanned),
      commandDisable: {
        disable: async (userId, reason, metadata) => {
          state.commandDisableCalls.push({
            kind: 'disable',
            metadata,
            reason,
            userId,
          })
          await Promise.resolve()
        },
        enable: async (userId, opts) => {
          state.commandDisableCalls.push({ kind: 'enable', opts, userId })
          await Promise.resolve()
        },
        recordNotification: async (userId, reason, metadata) => {
          state.commandDisableCalls.push({
            kind: 'recordNotification',
            metadata,
            reason,
            userId,
          })
          await Promise.resolve()
        },
      },
      getTwitchAPI: getTwitchAPIMock,
      logger: loggerMock,
      recordDisableNotification: async (userId, settingKey, reason, metadata) => {
        state.recordDisableNotificationCalls.push({
          metadata,
          reason,
          settingKey,
          userId,
        })
        await Promise.resolve()
      },
      resolveDisableNotifications: async (userId, settingKey, opts) => {
        state.resolveDisableNotificationCalls.push({
          opts,
          settingKey,
          userId,
        })
        await Promise.resolve()
      },
      supabase: supabaseMock,
      trackDisableReason: async (userId, settingKey, reason, metadata, opts) => {
        state.trackDisableReasonCalls.push({
          metadata,
          opts,
          reason,
          settingKey,
          userId,
        })
        await Promise.resolve()
      },
      trackResolveReason: async (userId, settingKey, autoResolved, opts) => {
        state.trackResolveReasonCalls.push({
          autoResolved,
          opts,
          settingKey,
          userId,
        })
        await Promise.resolve()
      },
    })
  )
}
reinstallSharedUtilsMock()

const realRanks = await import('../../../dota/lib/ranks')

const createMongoCursorFixture = function createMongoCursorFixture(collectionName: string) {
  return {
    toArray: async () =>
      await Promise.resolve(collectionName === 'notablePlayers' ? state.notablePlayers : []),
  }
}

const createMongoCollectionFixture = function createMongoCollectionFixture(collectionName: string) {
  return {
    find: () => createMongoCursorFixture(collectionName),
    findOne: async () => await Promise.resolve(state.delayedGame),
  }
}

const reinstallModuleMocks = function reinstallModuleMocks() {
  reinstallSharedUtilsMock()

  vi.doMock(import('../../../dota/lib/update-mmr'), () => ({
    tellChatNewMMR: () => {},
    updateMmr: async (args: UpdateMmrParams) => {
      state.updateMmrCalls.push(args)
      await Promise.resolve()
    },
  }))

  // Mock only the network-touching functions in ranks.js. The rest
  // (rankTierToMmr, mmrToRankTier, etc.) are pure helpers used elsewhere in
  // the dota source, so we re-export them as-is from the real module.
  vi.doMock(import('../../../dota/lib/ranks'), () => ({
    ...realRanks,
    getDotabodRankProfile: async () => await Promise.resolve(state.dotabodRankProfile),
    getRankDescription: async () => await Promise.resolve(state.rankDescription),
    getRankTitle: () => state.rankTitle,
  }))

  // Profanity filter does local + OpenAI checks; mock to keep tests offline and
  // deterministic. Default passthrough; tests that want to assert profanity
  // handling can override `state.moderateTextOverride`.
  vi.doMock('@dotabod/profanity-filter', () => ({
    moderateText: async (text?: string | string[]) => {
      if (state.moderateTextOverride) {
        return await Promise.resolve(state.moderateTextOverride(text))
      }
      return await Promise.resolve(text)
    },
  }))

  // Mongo is only used by a few match-data commands (ranked, spectators, ...).
  // connect() yields a db whose delayedGames.findOne returns state.delayedGame.
  vi.doMock('../../../steam/mongo-db-singleton', () => ({
    default: {
      close: async () => {
        await Promise.resolve()
      },
      connect: async () =>
        await Promise.resolve({
          collection: (name: string) => createMongoCollectionFixture(name),
        }),
    },
  }))
}

reinstallModuleMocks()

await initTestI18n()

// Import after all module mocks are registered.
const resolveMatchModule = await import('../resolve-match')
export const { resolveMatchRetroactively } = resolveMatchModule
export const { findMostRecentResolvedMatch } = resolveMatchModule
export const { closeTwitchBet } = await import('../close-twitch-bet')
export const { refundTwitchBet } = await import('../refund-twitch-bets')
export const { isPredictionAlreadyActiveError, openTwitchBet } = await import('../open-twitch-bet')
const { gsiHandlers } = await import('../../../dota/lib/consts')
const { steamSocket } = await import('../../../steam/ws')
const { chatClient } = await import('../../chat-client')
const { redisClient } = await import('../../../db/redis-instance')
const commandHandlerModule = await import('../command-handler')
export const commandHandler = commandHandlerModule.default
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
Object.defineProperty(steamSocket, 'emit', {
  configurable: true,
  value: (...emitArguments: SteamSocketEmitArguments) => {
    const [event, , callback] = emitArguments
    if (state.steamSocketError !== null) {
      callback(state.steamSocketError, null)
      return
    }
    if (event === 'getPlayerSummaries') {
      callback(null, state.steamPlayerSummaries)
      return
    }
    callback(null, state.steamSocketResponse ?? { last_match: null, matches: [] })
  },
})

const fakeGsiHandler = createGsiHandlerStub(createSocketClientStub(), {
  closeBets: async (...args) => {
    state.closeBetsCalls.push(args)
    await Promise.resolve()
  },
  emitWLUpdate: () => {
    state.emitWLUpdateCalls += 1
  },
  getChannelId: () => state.channelId ?? '',
})
gsiHandlers.set('token-abc', fakeGsiHandler)

const { server } = await import('../../../dota/server')

// Re-assert chatClient / redisClient / server patches each time. gsiMocks.ts
// also monkey-patches these singletons in its installGsiMocks(); whichever
// harness loaded last wins. Calling this in resetState() (which every twitch
// test calls in beforeEach) guarantees the twitch patches are active.
const installTwitchMocks = function installTwitchMocks() {
  chatClient.say = (channel: string, message: string, messageId?: string) => {
    state.chatSayCalls.push({ channel, message, messageId })
  }

  Object.assign(redisClient, {
    client: {
      del: async (key: string) => {
        state.redisDelCalls.push(key)
        return await Promise.resolve(1)
      },
      get: async (key: string) => await Promise.resolve(state.redisGet[key] ?? null),
      json: {
        get: async () => await Promise.resolve(null),
        set: async () => await Promise.resolve('OK'),
      },
      set: async () => await Promise.resolve('OK'),
      zAdd: async () => await Promise.resolve(0),
      zRangeByScore: async () => await Promise.resolve<string[]>([]),
      zRem: async () => await Promise.resolve(0),
    },
  })

  // Inject a stub socket.io server so commands that talk to the overlay
  // (count, refresh, online, resetwl) don't throw "Server not initialized".
  // fetchSockets returns [] so overlay-dependent paths take their empty branch.
  server.setServer({
    io: {
      fetchSockets: async () => await Promise.resolve([]),
      to: (room: string) => ({
        emit: (event: string, ...args: unknown[]) => {
          state.socketEmitCalls.push({ args, event, room })
          if (event === 'refresh-settings') {
            state.streamStatusEffectCalls.push('socket')
          }
        },
      }),
    },
  })

  // Re-register the fake gsi handler; getDBUser.test.ts calls gsiHandlers.clear()
  // in its beforeEach, which wipes this entry and makes `!hero` fall through to
  // "not playing" (the command guards on gsiHandlers.get(token) being truthy).
  gsiHandlers.set('token-abc', fakeGsiHandler)
}

export const resetState = function resetState() {
  state.sessionMatch = null
  state.olderMatch = null
  state.recentList = []
  state.redisGet = {}
  state.redisDelCalls = []
  state.updateCalls = []
  state.upsertCalls = []
  state.updateMmrCalls = []
  state.chatSayCalls = []
  state.closeBetsCalls = []
  state.socketEmitCalls = []
  state.streamStatusEffectCalls = []
  state.steamSocketResponse = null
  state.steamSocketError = null
  state.steamPlayerSummaries = []
  state.predictions = []
  state.resolvePredictionCalls = []
  state.cancelPredictionCalls = []
  state.createPredictionCalls = []
  state.createPredictionError = null
  state.getPredictionsCalls = []
  state.getPredictionsError = null
  state.getPredictionsTransientFailures = 0
  state.loggerErrorCalls = []
  state.emitWLUpdateCalls = 0
  state.channelId = null
  state.loggerInfoCalls = []
  state.groupedBets = []
  state.groupedBetsError = null
  state.rpcCalls = []
  state.gteCalls = []
  state.dotabodRankProfile = null
  state.rankTitle = 'Immortal'
  state.rankDescription = null
  state.botBanned = false
  state.subscriberOnlyMode = false
  state.chatSettingsUpdates = []
  state.delayedGame = null
  state.notablePlayers = []
  state.moderateTextOverride = null
  state.trackDisableReasonCalls = []
  state.trackResolveReasonCalls = []
  state.recordDisableNotificationCalls = []
  state.resolveDisableNotificationCalls = []
  state.commandDisableCalls = []
  reinstallModuleMocks()
  installTwitchMocks()
}

installTwitchMocks()

export type Client = Parameters<typeof resolveMatchRetroactively>[0]

export const makeClient = function makeClient(overrides: Partial<Client> = {}): Client {
  const client = createSocketClientStub({
    Account: {
      access_token: '',
      expires_at: null,
      expires_in: null,
      obtainment_timestamp: null,
      providerAccountId: 'twitch-channel-1',
      refresh_token: '',
      requires_refresh: false,
      scope: null,
    },
    SteamAccount: [],
    beta_tester: false,
    locale: 'en',
    mmr: 5000,
    name: 'streamer',
    settings: [],
    steam32Id: 99_999,
    stream_online: true,
    stream_start_date: new Date('2026-05-19T08:00:00Z'),
    token: 'token-abc',
    ...overrides,
  })

  if (client.gsi && !('gsiUpdatedAt' in overrides)) {
    client.gsiUpdatedAt = Date.now()
  }

  return client
}

export const baseMatchRow = (overrides: Partial<SessionMatchRow> = {}): SessionMatchRow => ({
  id: 'row-uuid-1',
  is_party: false,
  lobby_type: 7,
  matchId: '7777777777',
  myTeam: 'radiant',
  predictionId: 'pred-1',
  steam32Id: 99_999,
  won: null,
  ...overrides,
})

// A minimal "in a live match as your own hero" GSI packet. `extra` shallow-
// merges so callers can override player/hero (e.g. set player.xpm).
export const liveGsi = () =>
  createPacketStub({
    hero: { id: 1 },
    map: {
      game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      matchid: '7777777777',
      win_team: 'none',
    },
    player: { accountid: '99999', activity: 'playing' },
  })

export const makeMessage = function makeMessage({
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
}): MessageType {
  const client = makeClient({ subscription: PRO_SUB, ...clientOverrides })
  return {
    channel: {
      client,
      id: channelId,
      name: '#streamer',
      settings: client.settings,
    },
    content,
    user: { messageId: 'msg-1', name: userName, permission, userId: 'user-1' },
  }
}
