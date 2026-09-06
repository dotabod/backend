import { logger, supabase } from '@dotabod/shared-utils'
import { z } from 'zod'

import { redisClient } from '../../db/redis-instance'

// Stale tokens (deleted users, never-registered Twitch IDs) outlive process restarts,
// so persist the negative cache to Redis with a TTL. Hot-path `has()` stays in-memory.
export const REDIS_KEY_PREFIX = 'dotabod:invalid_token:'
export const TTL_SECONDS = 24 * 60 * 60
export const TTL_MS = TTL_SECONDS * 1000
// Transient (in-memory only) entries use a shorter horizon so a DB blip doesn't
// silently lock a user out for the full 24h.
export const EPHEMERAL_TTL_MS = 5 * 60 * 1000

export type InvalidToken = string | number | null | undefined

const persistedTokenSchema = z.string().min(1)
const SEED_VALUES: readonly InvalidToken[] = ['', null, undefined, 0]
const NEVER_EXPIRES = Number.POSITIVE_INFINITY

export interface RedisLike {
  isReady: boolean
  setEx: (key: string, ttl: number, value: string) => Promise<string | null>
  del: (key: string) => Promise<number>
}

export class InvalidTokensCache {
  // value → expiry-timestamp-ms. NEVER_EXPIRES for pre-seeded falsy guards.
  // Using a Map (not Set) so `has()` can lazy-evict entries whose TTL elapsed,
  // keeping the in-memory layer in lockstep with Redis instead of outliving it.
  private readonly getClient: () => RedisLike
  private readonly mem = new Map<InvalidToken, number>()

  constructor(getClient: () => RedisLike) {
    this.getClient = getClient
    this.seed()
  }

  has(value: InvalidToken): boolean {
    const expiry = this.mem.get(value)
    if (expiry === undefined) {
      return false
    }
    if (Date.now() >= expiry) {
      this.mem.delete(value)
      return false
    }
    return true
  }

  /** Persistent invalid: confirmed missing/refresh-required user. Survives restarts. */
  add(value: InvalidToken): this {
    this.mem.set(value, Date.now() + TTL_MS)
    const parsedToken = persistedTokenSchema.safeParse(value)
    if (parsedToken.success) {
      void this.persist(parsedToken.data)
    }
    return this
  }

  /**
   * Transient invalid: in-memory only with a short TTL. Used when a DB outage
   * prevents us from confirming whether the token is actually bad. Bounds log
   * spam during the outage; the short TTL lets recovery happen automatically
   * after the DB heals, without waiting for a deploy.
   */
  addEphemeral(value: InvalidToken): this {
    this.mem.set(value, Date.now() + EPHEMERAL_TTL_MS)
    return this
  }

  delete(value: InvalidToken): boolean {
    const removed = this.mem.delete(value)
    const parsedToken = persistedTokenSchema.safeParse(value)
    if (parsedToken.success) {
      void this.removePersisted(parsedToken.data)
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
    for (const seedValue of SEED_VALUES) {
      this.mem.set(seedValue, NEVER_EXPIRES)
    }
  }

  private async persist(token: string): Promise<void> {
    const client = this.getClient()
    if (!client.isReady) {
      return
    }
    try {
      await client.setEx(`${REDIS_KEY_PREFIX}${token}`, TTL_SECONDS, '1')
    } catch (error) {
      logger.warn('[USER] invalidTokens redis setEx failed', { error, value: token })
    }
  }

  private async removePersisted(token: string): Promise<void> {
    const client = this.getClient()
    if (!client.isReady) {
      return
    }
    try {
      await client.del(`${REDIS_KEY_PREFIX}${token}`)
    } catch (error) {
      // Surface the failure so a stale Redis tombstone doesn't silently
      // re-hydrate the user on the next deploy.
      logger.warn('[USER] invalidTokens redis del failed', { error, value: token })
    }
  }
}

export const invalidTokens = new InvalidTokensCache(() => redisClient.client)

interface RedisScanLike {
  isReady?: boolean
  scanIterator: (opts: { MATCH: string; COUNT: number }) => AsyncIterable<string>
}

export const hydrateInvalidTokensFromRedis = async function hydrateInvalidTokensFromRedis(
  cache: InvalidTokensCache,
  client: RedisScanLike
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
      COUNT: 500,
      MATCH: `${REDIS_KEY_PREFIX}*`,
    })) {
      const token = key.slice(REDIS_KEY_PREFIX.length)
      if (token && !cache.has(token)) {
        cache.hydrate(token)
        count += 1
      }
    }
  } catch (error) {
    // Real boot failure — alert.
    logger.error('[USER] invalidTokens hydrate Redis scan failed', { error })
  }
  return count
}

export const hydrateInvalidTokensFromDb = async function hydrateInvalidTokensFromDb(
  cache: InvalidTokensCache
): Promise<number> {
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
        if (id !== null && id.length > 0 && !cache.has(id)) {
          // Persistent add — these rows ARE genuinely requires_refresh=true,
          // so a fresh 24h TTL is the right behavior.
          cache.add(id)
          count += 1
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

export const hydrateInvalidTokens = async function hydrateInvalidTokens(): Promise<void> {
  const redisCount = await hydrateInvalidTokensFromRedis(invalidTokens, redisClient.client)
  logger.info('[USER] invalidTokens hydrated from Redis', { count: redisCount })
  await hydrateInvalidTokensFromDb(invalidTokens)
}
