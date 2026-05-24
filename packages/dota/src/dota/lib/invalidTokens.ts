import { logger, supabase } from '@dotabod/shared-utils'
import { redisClient } from '../../db/redisInstance'

// Stale tokens (deleted users, never-registered Twitch IDs) outlive process restarts,
// so persist the negative cache to Redis with a TTL. Hot-path `has()` stays in-memory.
export const REDIS_KEY_PREFIX = 'dotabod:invalid_token:'
export const TTL_SECONDS = 24 * 60 * 60
export const TTL_MS = TTL_SECONDS * 1000
// Transient (in-memory only) entries use a shorter horizon so a DB blip doesn't
// silently lock a user out for the full 24h.
export const EPHEMERAL_TTL_MS = 5 * 60 * 1000

const SEED_VALUES: readonly unknown[] = ['', null, undefined, 0]
const NEVER_EXPIRES = Number.POSITIVE_INFINITY

export interface RedisLike {
  isReady: boolean
  setEx: (key: string, ttl: number, value: string) => Promise<unknown>
  del: (key: string) => Promise<unknown>
}

export class InvalidTokensCache {
  // value → expiry-timestamp-ms. NEVER_EXPIRES for pre-seeded falsy guards.
  // Using a Map (not Set) so `has()` can lazy-evict entries whose TTL elapsed,
  // keeping the in-memory layer in lockstep with Redis instead of outliving it.
  private readonly mem = new Map<unknown, number>()

  constructor(private readonly getClient: () => RedisLike) {
    this.seed()
  }

  has(value: unknown): boolean {
    const expiry = this.mem.get(value)
    if (expiry === undefined) return false
    if (Date.now() >= expiry) {
      this.mem.delete(value)
      return false
    }
    return true
  }

  /** Persistent invalid: confirmed missing/refresh-required user. Survives restarts. */
  add(value: unknown): this {
    this.mem.set(value, Date.now() + TTL_MS)
    if (typeof value === 'string' && value.length > 0) {
      const client = this.getClient()
      if (client.isReady) {
        client.setEx(`${REDIS_KEY_PREFIX}${value}`, TTL_SECONDS, '1').catch((error) => {
          logger.warn('[USER] invalidTokens redis setEx failed', { value, error })
        })
      }
    }
    return this
  }

  /**
   * Transient invalid: in-memory only with a short TTL. Used when a DB outage
   * prevents us from confirming whether the token is actually bad. Bounds log
   * spam during the outage; the short TTL lets recovery happen automatically
   * after the DB heals, without waiting for a deploy.
   */
  addEphemeral(value: unknown): this {
    this.mem.set(value, Date.now() + EPHEMERAL_TTL_MS)
    return this
  }

  delete(value: unknown): boolean {
    const removed = this.mem.delete(value)
    if (typeof value === 'string' && value.length > 0) {
      const client = this.getClient()
      if (client.isReady) {
        client.del(`${REDIS_KEY_PREFIX}${value}`).catch((error) => {
          // Surface the failure so a stale Redis tombstone doesn't silently
          // re-hydrate the user on the next deploy.
          logger.warn('[USER] invalidTokens redis del failed', { value, error })
        })
      }
    }
    return removed
  }

  clear(): void {
    this.mem.clear()
    this.seed()
  }

  /**
   * Boot-only: seed in-memory without writing back to Redis (preserves TTL).
   * We approximate the remaining lifetime as a fresh TTL — exact remaining
   * ttl would require a per-key PTTL round trip. Worst-case drift: the
   * in-memory entry lives up to TTL longer than the Redis entry; lazy
   * eviction in `has()` makes this self-correcting on the next miss.
   */
  hydrate(value: string): void {
    this.mem.set(value, Date.now() + TTL_MS)
  }

  private seed(): void {
    for (const v of SEED_VALUES) this.mem.set(v, NEVER_EXPIRES)
  }
}

export const invalidTokens = new InvalidTokensCache(
  () => redisClient.client as unknown as RedisLike,
)

/**
 * Boot-time hydration. Always runs both layers:
 *   1. Redis SCAN re-seeds in-memory from whatever tombstones survived.
 *   2. DB scan re-seeds requires_refresh=true accounts whose Redis TTL elapsed.
 * Skipping entries already in memory means the DB writeback only fires for
 * truly missing keys, preserving existing TTLs and avoiding a TTL-refresh
 * loop on every deploy.
 */
export async function hydrateInvalidTokens(): Promise<void> {
  const redisCount = await hydrateInvalidTokensFromRedis(invalidTokens, redisClient.client)
  logger.info('[USER] invalidTokens hydrated from Redis', { count: redisCount })
  await hydrateInvalidTokensFromDb(invalidTokens)
}

interface RedisScanLike {
  isReady?: boolean
  scanIterator: (opts: { MATCH: string; COUNT: number }) => AsyncIterable<string>
}

export async function hydrateInvalidTokensFromRedis(
  cache: InvalidTokensCache,
  client: RedisScanLike,
): Promise<number> {
  // Gate on isReady: if the connection isn't up we can't scan. The caller
  // (setupRedisClient) currently awaits connectClient() before invoking us,
  // but future call sites might not.
  if (client.isReady === false) {
    logger.error('[USER] invalidTokens hydrate skipped: redis not ready')
    return 0
  }
  let count = 0
  try {
    for await (const key of client.scanIterator({
      MATCH: `${REDIS_KEY_PREFIX}*`,
      COUNT: 500,
    })) {
      const token = key.slice(REDIS_KEY_PREFIX.length)
      if (token && !cache.has(token)) {
        cache.hydrate(token)
        count++
      }
    }
  } catch (error) {
    // Real boot failure — alert.
    logger.error('[USER] invalidTokens hydrate Redis scan failed', { error })
  }
  return count
}

/**
 * One-shot DB hydration mirroring the inverse of
 * `packages/twitch-events/src/twitch/lib/getAccountIds.ts` validity filters.
 * Only seeds `requires_refresh = true` accounts — that's the subset getDBUser
 * already marks invalid (getDBUser.ts:151), so this just preempts the two DB
 * round-trips that would otherwise happen on the first chat / GSI hit.
 *
 * Does NOT cover the deleted-account spam source (PGRST116 / 0 rows) — those
 * rows are gone from the table and can only be learned lazily.
 */
export async function hydrateInvalidTokensFromDb(cache: InvalidTokensCache): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('providerAccountId, userId')
      .eq('provider', 'twitch')
      .eq('requires_refresh', true)

    if (error) {
      logger.error('[USER] invalidTokens DB hydrate failed', { error: error.message })
      return 0
    }

    let count = 0
    for (const row of data ?? []) {
      for (const id of [row.providerAccountId, row.userId]) {
        if (typeof id === 'string' && id.length > 0 && !cache.has(id)) {
          // Persistent add — these rows ARE genuinely requires_refresh=true,
          // so a fresh 24h TTL is the right behavior.
          cache.add(id)
          count++
        }
      }
    }
    logger.info('[USER] invalidTokens hydrated from DB', { count })
    return count
  } catch (error) {
    logger.error('[USER] invalidTokens DB hydrate threw', { error })
    return 0
  }
}
