import { setTimeout as sleep } from 'node:timers/promises'

import type {
  Json,
  checkBotStatus,
  commandDisable,
  recordDisableNotification,
  resolveDisableNotifications,
  trackDisableReason,
  trackResolveReason,
} from '@dotabod/shared-utils'

import type { GSIHandlerType } from '../dota/gsi-handler-types'
import type { Packet, SocketClient } from '../types'

type TwitchAccount = NonNullable<SocketClient['Account']>

// Helpers shared across the package's test harnesses. Filename intentionally
// not `.test.ts` so bun's runner ignores it.
//
// Why this exists: bun's `mock.module()` is process-wide. When two harnesses
// (e.g. `twitch/lib/__tests__/setupMocks.ts` and `db/__tests__/dbMocks.ts`)
// both register a mock for `@dotabod/shared-utils`, the last registration
// wins — so they must export the same surface or downstream test files crash
// with "Export named X not found". Centralizing the surface here keeps the
// two harnesses in lockstep without copy/paste drift.

// Loose function signature so callers can supply any of the typical logger
// shapes (message + optional meta, variadic args, etc.) without TS contravariance
// rejecting them. Tests just care that the methods exist and capture calls.
type LoggerMetadata = Record<string, Date | Error | Json | undefined>

interface LoggerLike {
  info: (message: string, meta?: LoggerMetadata) => void
  error: (message: string, meta?: LoggerMetadata) => void
  warn: (message: string, meta?: LoggerMetadata) => void
  debug: (message: string, meta?: LoggerMetadata) => void
}

type DeepPartial<Owner> = Owner extends Date
  ? Owner
  : Owner extends readonly (infer Entry)[]
    ? DeepPartial<Entry>[]
    : Owner extends object
      ? { [Key in keyof Owner]?: DeepPartial<Owner[Key]> }
      : Owner

type PacketOverride = DeepPartial<Packet>

const createEntityData = function createEntityData() {
  return { data: [], lastUpdate: 0, timeout: 0 }
}

export function createSocketClientStub(): SocketClient
export function createSocketClientStub<T extends Partial<SocketClient>>(
  overrides: T
): SocketClient & T
export function createSocketClientStub(overrides: Partial<SocketClient> = {}): SocketClient {
  const client: SocketClient = {
    Account: null,
    SteamAccount: [],
    beta_tester: false,
    locale: 'en',
    mmr: 0,
    name: 'test-user',
    settings: [],
    steam32Id: null,
    stream_online: false,
    stream_start_date: null,
    token: 'test-token',
  }
  return Object.assign(client, overrides)
}

export const createTwitchAccountStub = function createTwitchAccountStub(
  overrides: Partial<TwitchAccount> = {}
): TwitchAccount {
  return {
    access_token: '',
    expires_at: null,
    expires_in: null,
    obtainment_timestamp: null,
    providerAccountId: 'test-channel',
    refresh_token: '',
    requires_refresh: false,
    scope: null,
    ...overrides,
  }
}

export function createPacketStub(): Packet
export function createPacketStub<T extends PacketOverride>(overrides: T): Packet & T
export function createPacketStub(overrides: PacketOverride = {}): Packet {
  const packet: Packet = {
    provider: { appid: 570, name: 'Dota 2', timestamp: 0, version: 1 },
  }
  return Object.assign(packet, overrides)
}

export const createGsiHandlerStub = function createGsiHandlerStub(
  client: SocketClient,
  overrides: Partial<GSIHandlerType> = {}
): GSIHandlerType {
  const completed = Promise.resolve()

  return {
    addSecondsToNow: (seconds) => new Date(Date.now() + seconds * 1000),
    blockCache: null,
    bountyHeroNames: [],
    checkingEarlyDCWinner: false,
    client,
    closeBets: async () => {
      await completed
    },
    creatingSteamAccount: false,
    disable: () => {},
    disabled: false,
    emitBadgeUpdate: () => {},
    emitNotablePlayers: async () => {
      await completed
    },
    emitStreamersInMatch: async () => {
      await completed
    },
    emitWLUpdate: () => {},
    enable: () => {},
    endingBets: false,
    events: [],
    getChannelId: () => client.Account?.providerAccountId ?? '',
    getMmr: () => client.mmr,
    getSteam32: () => client.steam32Id,
    getToken: () => client.token,
    mapBlocker: {
      minimap: {
        buildings: createEntityData(),
        couriers: createEntityData(),
        creeps: createEntityData(),
        hero_units: createEntityData(),
        heroes: createEntityData(),
        scan: createEntityData(),
        tp: createEntityData(),
      },
      resetData: () => {},
      sendData: () => {},
      token: client.token,
    },
    neutralItemTimer: {
      checkNeutralItems: async () => {
        await completed
      },
      reset: () => {},
    },
    noTpChatter: {},
    openBets: async () => {
      await completed
    },
    openTheBet: async () => {
      await completed
    },
    openingBets: false,
    resetClientState: async () => {
      await completed
    },
    setupOBSBlockers: async () => {
      await completed
    },
    treadsData: { manaAtLastToggle: 0, manaSaved: 0, treadToggles: 0 },
    updateSteam32Id: async () => {
      await completed
    },
    ...overrides,
  }
}

interface SharedUtilsMockOptions<Supabase, TwitchApi, AuthProvider> {
  supabase: Supabase
  logger: LoggerLike
  getTwitchAPI?: () => Promise<TwitchApi>
  getAuthProvider?: () => AuthProvider
  checkBotStatus?: typeof checkBotStatus
  trackDisableReason?: typeof trackDisableReason
  trackResolveReason?: typeof trackResolveReason
  recordDisableNotification?: typeof recordDisableNotification
  resolveDisableNotifications?: typeof resolveDisableNotifications
  commandDisable?: typeof commandDisable
}

export const buildSharedUtilsMock = function buildSharedUtilsMock<
  Supabase,
  TwitchApi = Record<never, never>,
  AuthProvider = Record<never, never>,
>(opts: SharedUtilsMockOptions<Supabase, TwitchApi, AuthProvider>) {
  return {
    botStatus: { isBanned: false },
    checkBotStatus: opts.checkBotStatus ?? (async () => await Promise.resolve(false)),
    commandDisable: opts.commandDisable ?? {
      disable: async () => {},
      enable: async () => {},
      recordNotification: async () => {},
    },
    default: opts.supabase,
    fetchConduitId: async () => await Promise.resolve(''),
    getAuthProvider: opts.getAuthProvider ?? (() => ({})),
    getSupabaseClient: () => opts.supabase,
    getTwitchAPI: opts.getTwitchAPI ?? (async () => await Promise.resolve({})),
    getTwitchHeaders: () => ({}),
    getTwitchTokens: async () => await Promise.resolve({ access_token: '', refresh_token: '' }),
    hasTokens: () => true,
    logger: opts.logger,
    recordDisableNotification: opts.recordDisableNotification ?? (async () => {}),
    resolveDisableNotifications: opts.resolveDisableNotifications ?? (async () => {}),
    supabase: opts.supabase,
    trackDisableReason: opts.trackDisableReason ?? (async () => {}),
    trackResolveReason: opts.trackResolveReason ?? (async () => {}),
    updateConduitShard: async () => {},
  }
}

// Initialize i18next with the real English translation file so handlers that
// call `t()` emit real strings (not the key) in test output. Idempotent so
// multiple harnesses can call this safely.
export const initTestI18n = async function initTestI18n() {
  const i18nextModule = await import('i18next')
  const translationModule = await import('../../locales/en/translation.json')
  const i18next = i18nextModule.default
  const enTranslation = translationModule.default
  if (!i18next.isInitialized) {
    await i18next.init({
      fallbackLng: 'en',
      lng: 'en',
      // Mirror the production runtime config (dota/src/dota/index.ts). With
      // returnEmptyString:false an empty i18next plural variant falls back to
      // the base key instead of resolving to "". This matters because the
      // crowdin-download workflow's i18next-parser step auto-generates empty
      // CLDR plural placeholders (e.g. cosmetics.list_one / list_other) for
      // every locale on each sync — keyed off `t('cosmetics.list', { count })`.
      // Prod tolerates those via this flag; the harness must too, or
      // `t()` on a counted key returns "" and diverges from real behavior.
      resources: { en: { translation: enTranslation } },
      returnEmptyString: false,
      returnNull: false,
    })
    return
  }
  // i18next is a global singleton shared by every test file in the run. Another
  // file may have initialized it with a narrower resource set (e.g.
  // translationMessageFormat.test.ts), which would leave handlers here emitting
  // raw keys like "aegis.expired". Merge the full English bundle back in so
  // `t()` resolves real strings regardless of bun's file-execution order.
  i18next.addResourceBundle('en', 'translation', enTranslation, true, true)
  // Re-assert the prod options too: a prior initializer may have created the
  // singleton without them (see the narrow init in translationMessageFormat.test.ts).
  i18next.options.returnEmptyString = false
  i18next.options.returnNull = false
}

// A Pro subscription bypasses `canAccessFeature` gates everywhere settings/
// chatters are checked. Tests that want to focus on dispatch/handler logic
// (not billing) attach this to `client.subscription`.
export const PRO_SUB = {
  id: 'sub-1',
  isGift: false,
  status: 'ACTIVE',
  tier: 'PRO',
} satisfies NonNullable<SocketClient['subscription']>

// Drain microtasks queued by fire-and-forget async handlers. `events.emit`
// is synchronous, but handlers (and the `.then()` chains they spawn) run on
// the microtask/macrotask queue — one macrotask boundary is enough.
export const flushAsync = async () => {
  await sleep(0)
}
