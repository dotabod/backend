import { logger, supabase } from '@dotabod/shared-utils'

// In-memory caches keep us from hammering supabase on every GSI packet (5/sec/user).
// They're best-effort. Even on cache miss, the underlying upsert is idempotent
// (ignoreDuplicates), so a restart-warmup write storm only happens once per user.
const gsiSeenCache = new Set<string>()
const overlaySeenCache = new Set<string>()

async function recordFirstSeen(userId: string, key: 'gsi_first_seen_at' | 'overlay_first_seen_at') {
  const now = new Date().toISOString()
  const { error } = await supabase.from('settings').upsert(
    {
      userId,
      key,
      value: now,
      updated_at: now,
    },
    { onConflict: 'userId, key', ignoreDuplicates: true },
  )
  if (error) {
    logger.info('[setup-signals] upsert failed', { userId, key, error })
  }
}

export function recordGsiFirstSeen(userId: string): void {
  if (!userId || gsiSeenCache.has(userId)) return
  gsiSeenCache.add(userId)
  recordFirstSeen(userId, 'gsi_first_seen_at').catch(() => {
    // Swallow — on next packet the cache hit prevents a retry, which is fine.
    // A failed write here just delays the verify-state signal until next process start.
  })
}

export function recordOverlayFirstSeen(userId: string): void {
  if (!userId || overlaySeenCache.has(userId)) return
  overlaySeenCache.add(userId)
  recordFirstSeen(userId, 'overlay_first_seen_at').catch(() => {
    // Same as above.
  })
}
