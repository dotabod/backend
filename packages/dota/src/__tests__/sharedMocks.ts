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
type LoggerLike = {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

export function buildSharedUtilsMock(opts: {
  supabase: SupabaseLike
  logger: LoggerLike
  getTwitchAPI?: () => Promise<unknown>
  checkBotStatus?: () => Promise<boolean>
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
    trackDisableReason: async () => undefined,
    trackResolveReason: async () => undefined,
  }
}

// Initialize i18next with the real English translation file so handlers that
// call `t()` emit real strings (not the key) in test output. Idempotent so
// multiple harnesses can call this safely.
export async function initTestI18n() {
  const i18next = (await import('i18next')).default
  if (i18next.isInitialized) return
  const enTranslation = (await import('../../locales/en/translation.json')).default
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: enTranslation } },
  })
}

// A Pro subscription bypasses `canAccessFeature` gates everywhere settings/
// chatters are checked. Tests that want to focus on dispatch/handler logic
// (not billing) attach this to `client.subscription`.
export const PRO_SUB = { id: 'sub-1', tier: 'PRO', status: 'ACTIVE', isGift: false } as any

// Drain microtasks queued by fire-and-forget async handlers. `events.emit`
// is synchronous, but handlers (and the `.then()` chains they spawn) run on
// the microtask/macrotask queue — one macrotask boundary is enough.
export const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0))
