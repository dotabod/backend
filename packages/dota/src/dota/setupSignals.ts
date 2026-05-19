import { logger, supabase } from '@dotabod/shared-utils'
import { SETUP_SIGNAL_KEYS, type SetupSignalKey } from './setupSignalKeys'

// Bounded LRU-ish dedupe. Capped per-process so a long uptime with many users
// can't grow these unboundedly. On eviction the next packet pays one redundant
// idempotent upsert — harmless. Sized for ~10k active users per pod.
const CACHE_MAX = 10_000

class BoundedSet {
  private set = new Set<string>()
  has(key: string) {
    return this.set.has(key)
  }
  add(key: string) {
    if (this.set.size >= CACHE_MAX) {
      const oldest = this.set.values().next().value
      if (oldest !== undefined) this.set.delete(oldest)
    }
    this.set.add(key)
  }
}

const gsiSeenCache = new BoundedSet()
const overlaySeenCache = new BoundedSet()

async function recordFirstSeen(userId: string, key: SetupSignalKey) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert(
      { userId, key, value: true, updated_at: now },
      { onConflict: 'userId, key', ignoreDuplicates: true },
    )
  if (error) logger.info('[setup-signals] upsert failed', { userId, key, error })
}

// Cache populates before the upsert resolves: on the GSI hot path (5/sec/user) we'd
// rather accept one missed signal on transient failure than let duplicate writes pile up.
function recordOnce(userId: string, cache: BoundedSet, key: SetupSignalKey) {
  if (!userId || cache.has(userId)) return
  cache.add(userId)
  recordFirstSeen(userId, key).catch(() => {})
}

export function recordGsiFirstSeen(userId: string): void {
  recordOnce(userId, gsiSeenCache, SETUP_SIGNAL_KEYS.gsi)
}

export function recordOverlayFirstSeen(userId: string): void {
  recordOnce(userId, overlaySeenCache, SETUP_SIGNAL_KEYS.overlay)
}
