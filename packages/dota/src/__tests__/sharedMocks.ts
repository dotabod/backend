// Helpers shared across the package's test harnesses. Filename intentionally
// not `.test.ts` so bun's runner ignores it.
//
// Why this exists: bun's `mock.module()` is process-wide. When two harnesses
// (e.g. `twitch/lib/__tests__/setupMocks.ts` and `db/__tests__/dbMocks.ts`)
// both register a mock for `@dotabod/shared-utils`, the last registration
// wins — so they must export the same surface or downstream test files crash
// with "Export named X not found". Centralizing the surface here keeps the
// two harnesses in lockstep without copy/paste drift.

type SupabaseLike = unknown
// Loose function signature so callers can supply any of the typical logger
// shapes (message + optional meta, variadic args, etc.) without TS contravariance
// rejecting them. Tests just care that the methods exist and capture calls.
type LoggerLike = {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  debug: (...args: any[]) => void
}

export function buildSharedUtilsMock(opts: {
  supabase: SupabaseLike
  logger: LoggerLike
  getTwitchAPI?: () => Promise<unknown>
  checkBotStatus?: () => Promise<boolean>
  trackDisableReason?: (
    userId: string,
    settingKey: string,
    reason: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>
  trackResolveReason?: (userId: string, settingKey: string, autoResolved?: boolean) => Promise<void>
}) {
  return {
    supabase: opts.supabase,
    default: opts.supabase,
    getSupabaseClient: () => opts.supabase,
    logger: opts.logger,
    getTwitchAPI: opts.getTwitchAPI ?? (async () => ({})),
    getAuthProvider: () => ({}),
    getTwitchHeaders: () => ({}),
    getTwitchTokens: async () => ({ access_token: '', refresh_token: '' }),
    hasTokens: () => true,
    botStatus: { isBanned: false },
    checkBotStatus: opts.checkBotStatus ?? (async () => false),
    fetchConduitId: async () => '',
    updateConduitShard: async () => undefined,
    trackDisableReason: opts.trackDisableReason ?? (async () => undefined),
    trackResolveReason: opts.trackResolveReason ?? (async () => undefined),
  }
}

// Initialize i18next with the real English translation file so handlers that
// call `t()` emit real strings (not the key) in test output. Idempotent so
// multiple harnesses can call this safely.
export async function initTestI18n() {
  const i18next = (await import('i18next')).default
  const enTranslation = (await import('../../locales/en/translation.json')).default
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: enTranslation } },
    })
    return
  }
  // i18next is a global singleton shared by every test file in the run. Another
  // file may have initialized it with a narrower resource set (e.g.
  // translationMessageFormat.test.ts), which would leave handlers here emitting
  // raw keys like "aegis.expired". Merge the full English bundle back in so
  // `t()` resolves real strings regardless of bun's file-execution order.
  i18next.addResourceBundle('en', 'translation', enTranslation, true, true)
}

// A Pro subscription bypasses `canAccessFeature` gates everywhere settings/
// chatters are checked. Tests that want to focus on dispatch/handler logic
// (not billing) attach this to `client.subscription`.
export const PRO_SUB = { id: 'sub-1', tier: 'PRO', status: 'ACTIVE', isGift: false } as any

// Drain microtasks queued by fire-and-forget async handlers. `events.emit`
// is synchronous, but handlers (and the `.then()` chains they spawn) run on
// the microtask/macrotask queue — one macrotask boundary is enough.
export const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0))
