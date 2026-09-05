import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RedisLike } from '../invalidTokens.ts'

// dbMocks installs vi.doMock('@dotabod/shared-utils') at import time, so any
// downstream module that imports `supabase` / `logger` from shared-utils picks
// up the mock — but ONLY if those imports happen AFTER dbMocks loads. That's
// why every runtime symbol below is loaded via dynamic import. The `RedisLike`
// type-only import above gets erased and so doesn't trigger the eager load.
const { dbState, resetDbState } = await import('../../../db/__tests__/dbMocks.ts')

const {
  InvalidTokensCache,
  EPHEMERAL_TTL_MS,
  REDIS_KEY_PREFIX,
  TTL_MS,
  TTL_SECONDS,
  hydrateInvalidTokensFromDb,
  hydrateInvalidTokensFromRedis,
} = await import('../invalidTokens.ts')

// In-memory stub of the slice of node-redis v4 we touch. Keeps the Redis state
// observable so each test can assert exactly what was written / deleted.
type RedisCall =
  | { op: 'setEx'; key: string; ttl: number; value: string }
  | { op: 'del'; key: string }

function makeFakeRedis(
  opts: { isReady?: boolean; setExThrows?: boolean; delThrows?: boolean } = {}
) {
  const calls: RedisCall[] = []
  const client = {
    del: async (key: string) => {
      calls.push({ key, op: 'del' })
      if (opts.delThrows) {
        throw new Error('del failed')
      }
      return 1
    },
    isReady: opts.isReady ?? true,
    setEx: async (key: string, ttl: number, value: string) => {
      calls.push({ key, op: 'setEx', ttl, value })
      if (opts.setExThrows) {
        throw new Error('setEx failed')
      }
      return 'OK'
    },
  } as unknown as RedisLike
  return { calls, client }
}

const flushMicrotasks = async () =>{  await new Promise<void>((r) => setTimeout(r, 0)); }

beforeEach(() => {
  // dbState reset is required so hydrateInvalidTokensFromDb sees fresh table
  // results per test. The production `invalidTokens` singleton is intentionally
  // NOT cleared — every test in this file uses a locally-constructed
  // InvalidTokensCache, so polluting the singleton would only leak into sibling
  // test files (cross-file singleton pollution).
  resetDbState()
})

describe('InvalidTokensCache (class API)', () => {
  it('pre-seeds falsy values so empty/null lookups are treated as invalid out of the box', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)

    expect(cache.has('')).toBeTruthy()
    expect(cache.has(null)).toBeTruthy()
    expect(cache.has(undefined)).toBeTruthy()
    expect(cache.has(0)).toBeTruthy()
    expect(cache.has('not-seeded')).toBeFalsy()
  })

  it('add() then has() returns true', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)

    cache.add('tok-1')
    expect(cache.has('tok-1')).toBeTruthy()
  })

  it('add() returns the cache for chaining', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)
    expect(cache.add('x')).toBe(cache)
  })

  it('delete() returns true when the entry existed, false otherwise', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)
    cache.add('present')

    expect(cache.delete('present')).toBeTruthy()
    expect(cache.delete('never-added')).toBeFalsy()
    expect(cache.has('present')).toBeFalsy()
  })

  it('clear() removes user-added entries but restores the pre-seeded falsy guards', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)
    cache.add('a')
    cache.add('b')

    cache.clear()

    // User entries gone.
    expect(cache.has('a')).toBeFalsy()
    expect(cache.has('b')).toBeFalsy()
    // Pre-seeded falsy guards restored so empty/undefined lookups still
    // short-circuit (mirrors production startup behavior, not the old Set's
    // permanently-wiped semantics).
    expect(cache.has('')).toBeTruthy()
    expect(cache.has(null)).toBeTruthy()
    expect(cache.has(undefined)).toBeTruthy()
    expect(cache.has(0)).toBeTruthy()
  })

  it('hydrate() seeds the in-memory Set without firing Redis writes', () => {
    const { client, calls } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)

    cache.hydrate('seeded-1')
    cache.hydrate('seeded-2')

    expect(cache.has('seeded-1')).toBeTruthy()
    expect(cache.has('seeded-2')).toBeTruthy()
    expect(calls).toStrictEqual([])
  })
})

describe('InvalidTokensCache → in-memory TTL & lazy eviction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has() lazy-evicts an entry once its in-memory TTL elapses (matches Redis 24h expiry)', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.add('user-X')
    expect(cache.has('user-X')).toBeTruthy()

    // 23h59m59s in — still cached.
    vi.advanceTimersByTime(TTL_MS - 1000)
    expect(cache.has('user-X')).toBeTruthy()

    // Cross the 24h boundary — entry should be lazy-evicted on the next read.
    vi.advanceTimersByTime(2000)
    expect(cache.has('user-X')).toBeFalsy()
  })

  it('addEphemeral() uses the shorter 5m TTL so transient DB blips recover without a deploy', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.addEphemeral('blip-token')
    expect(cache.has('blip-token')).toBeTruthy()

    // Just before the 5m horizon.
    vi.advanceTimersByTime(EPHEMERAL_TTL_MS - 1000)
    expect(cache.has('blip-token')).toBeTruthy()

    // After the 5m horizon — gone.
    vi.advanceTimersByTime(2000)
    expect(cache.has('blip-token')).toBeFalsy()

    // Persistent add(...) entries from another path are NOT evicted at 5m —
    // they stay until the full 24h TTL.
    cache.add('persistent-token')
    vi.advanceTimersByTime(EPHEMERAL_TTL_MS)
    expect(cache.has('persistent-token')).toBeTruthy()
  })

  it('pre-seeded falsy guards never expire (Number.POSITIVE_INFINITY sentinel)', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    // Jump 10 years forward.
    vi.advanceTimersByTime(10 * 365 * 24 * 60 * 60 * 1000)

    expect(cache.has('')).toBeTruthy()
    expect(cache.has(null)).toBeTruthy()
    expect(cache.has(undefined)).toBeTruthy()
    expect(cache.has(0)).toBeTruthy()
  })

  it('clear() re-seeds with infinite-expiry guards even after time has moved on', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.add('a')

    vi.advanceTimersByTime(TTL_MS + 1000)
    expect(cache.has('a')).toBeFalsy() // 'a' expired

    cache.clear()
    // Guards restored and still infinite.
    vi.advanceTimersByTime(TTL_MS * 2)
    expect(cache.has('')).toBeTruthy()
    expect(cache.has(null)).toBeTruthy()
  })

  it('hydrate(value) gets a fresh TTL so the in-memory layer outlives Redis by at most one full TTL', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.hydrate('hydrated-tok')
    expect(cache.has('hydrated-tok')).toBeTruthy()

    vi.advanceTimersByTime(TTL_MS - 1000)
    expect(cache.has('hydrated-tok')).toBeTruthy()

    vi.advanceTimersByTime(2000)
    expect(cache.has('hydrated-tok')).toBeFalsy()
  })

  it('re-adding a token resets its TTL (so a fresh watcher event extends the window)', () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.add('rolling-tok')

    // Halfway through original TTL.
    vi.advanceTimersByTime(TTL_MS / 2)
    // Re-add resets expiry.
    cache.add('rolling-tok')

    // Original-TTL boundary — would have been evicted without the re-add.
    vi.advanceTimersByTime(TTL_MS / 2 + 1000)
    expect(cache.has('rolling-tok')).toBeTruthy()

    // Full TTL after the re-add — now evicted.
    vi.advanceTimersByTime(TTL_MS / 2)
    expect(cache.has('rolling-tok')).toBeFalsy()
  })
})

describe('InvalidTokensCache → Redis side effects', () => {
  it('add(string) issues setEx with the prefixed key and 24h TTL when Redis is ready', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)

    cache.add('alice')

    await flushMicrotasks()
    expect(calls).toStrictEqual([
      { key: `${REDIS_KEY_PREFIX}alice`, op: 'setEx', ttl: TTL_SECONDS, value: '1' },
    ])
    expect(TTL_SECONDS).toBe(24 * 60 * 60)
  })

  it('delete(string) issues del with the prefixed key when Redis is ready', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)
    cache.add('bob')
    calls.length = 0

    cache.delete('bob')

    await flushMicrotasks()
    expect(calls).toStrictEqual([{ key: `${REDIS_KEY_PREFIX}bob`, op: 'del' }])
  })

  it('skips Redis writes when isReady is false (boot / test environments)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.add('cold')
    cache.delete('cold')

    await flushMicrotasks()
    expect(calls).toStrictEqual([])
  })

  it('skips Redis for non-string values (empty string, null, undefined, number)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)

    cache.add('')
    cache.add(null)
    cache.add(undefined)
    cache.add(0)
    cache.delete('')
    cache.delete(null)

    await flushMicrotasks()
    expect(calls).toStrictEqual([])
  })

  it('logs warn (does not silently swallow) when Redis setEx/del reject so failures stay observable', async () => {
    const { client, calls } = makeFakeRedis({
      delThrows: true,
      isReady: true,
      setExThrows: true,
    })
    const cache = new InvalidTokensCache(() => client)

    cache.add('boom')
    cache.delete('boom')

    await flushMicrotasks()
    expect(calls).toHaveLength(2)
    expect(cache.has('boom')).toBeFalsy()
    expect(
      dbState.loggerWarnCalls.some((c) => c.message === '[USER] invalidTokens redis setEx failed')
    ).toBeTruthy()
    expect(
      dbState.loggerWarnCalls.some((c) => c.message === '[USER] invalidTokens redis del failed')
    ).toBeTruthy()
  })

  it('add() keeps the in-memory entry even when Redis setEx rejects (no silent loss)', async () => {
    // Contract: a Redis outage during add() must NOT lose the in-memory
    // entry. Otherwise getDBUser would re-hit the DB for a known-bad token
    // every chat message, defeating the cache. The Redis write is logged
    // for observability and a future deploy re-warms via hydrate().
    const { client } = makeFakeRedis({ isReady: true, setExThrows: true })
    const cache = new InvalidTokensCache(() => client)

    cache.add('redis-down-token')
    await flushMicrotasks()

    expect(cache.has('redis-down-token')).toBeTruthy()
    expect(
      dbState.loggerWarnCalls.some((c) => c.message === '[USER] invalidTokens redis setEx failed')
    ).toBeTruthy()
  })

  it('lazy getClient re-reads the client on every call so test reassignments are visible', async () => {
    let activeClient = makeFakeRedis({ isReady: true }).client
    let activeCalls: RedisCall[] = []
    // Track calls on whichever client is currently active.
    activeClient.setEx = async (key: string, ttl: number, value: string) => {
      activeCalls.push({ key, op: 'setEx', ttl, value })
      return 'OK'
    }
    const cache = new InvalidTokensCache(() => activeClient)

    cache.add('first')
    await flushMicrotasks()
    expect(activeCalls).toHaveLength(1)

    // Swap in a fresh client (simulates setupMocks.ts reassigning redisClient.client).
    const swapped = makeFakeRedis({ isReady: true }).client
    const swappedCalls: RedisCall[] = []
    swapped.setEx = async (key: string, ttl: number, value: string) => {
      swappedCalls.push({ key, op: 'setEx', ttl, value })
      return 'OK'
    }
    activeClient = swapped
    activeCalls = []

    cache.add('second')
    await flushMicrotasks()
    expect(swappedCalls).toHaveLength(1)
    expect(swappedCalls[0]?.key).toBe(`${REDIS_KEY_PREFIX}second`)
  })

  it('addEphemeral seeds the in-memory Set but skips Redis entirely (for transient DB errors)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)

    cache.addEphemeral('transient-token')

    await flushMicrotasks()
    expect(cache.has('transient-token')).toBeTruthy()
    expect(calls).toStrictEqual([])
  })
})

describe('hydrateInvalidTokensFromRedis', () => {
  function makeScannerClient(keys: string[], opts: { throws?: boolean } = {}) {
    return {
      async *scanIterator() {
        if (opts.throws) {
          throw new Error('scan exploded')
        }
        for (const k of keys) {
          yield k
        }
      },
    }
  }

  it('seeds the cache from every scanned key, stripping the prefix', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([
      `${REDIS_KEY_PREFIX}user-1`,
      `${REDIS_KEY_PREFIX}twitch-2`,
      `${REDIS_KEY_PREFIX}provider-3`,
    ])

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(3)
    expect(cache.has('user-1')).toBeTruthy()
    expect(cache.has('twitch-2')).toBeTruthy()
    expect(cache.has('provider-3')).toBeTruthy()
  })

  it('skips empty-suffix keys defensively', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([REDIS_KEY_PREFIX, `${REDIS_KEY_PREFIX}real`])

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(1)
    expect(cache.has('real')).toBeTruthy()
  })

  it('does not double-count entries that are already in the cache', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    cache.hydrate('dupe')

    const scanner = makeScannerClient([`${REDIS_KEY_PREFIX}dupe`, `${REDIS_KEY_PREFIX}fresh`])

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(1)
    expect(cache.has('dupe')).toBeTruthy()
    expect(cache.has('fresh')).toBeTruthy()
  })

  it('uses cache.hydrate (no Redis writeback) so TTLs are preserved on boot', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([`${REDIS_KEY_PREFIX}preserve-me`])

    await hydrateInvalidTokensFromRedis(cache, scanner)

    // Crucial: if hydrate accidentally called add(), it would issue a setEx and
    // refresh the TTL on every boot, defeating the 24h expiry.
    expect(calls).toStrictEqual([])
  })

  it('returns 0 and logs at error level when the SCAN throws (a real boot failure)', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = {
      isReady: true,
      scanIterator: (): AsyncIterable<string> => ({
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              throw new Error('scan exploded')
            },
          }
        },
      }),
    }

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(0)
    expect(
      dbState.loggerErrorCalls.some(
        (c) => c.message === '[USER] invalidTokens hydrate Redis scan failed'
      )
    ).toBeTruthy()
  })

  it('returns 0 and logs error when the client is not ready (skips the SCAN entirely)', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = {
      isReady: false,
      async *scanIterator() {
        yield `${REDIS_KEY_PREFIX}should-not-see-this`
      },
    }

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(0)
    expect(cache.has('should-not-see-this')).toBeFalsy()
    expect(
      dbState.loggerErrorCalls.some(
        (c) => c.message === '[USER] invalidTokens hydrate skipped: redis not ready'
      )
    ).toBeTruthy()
  })

  it('returns 0 cleanly for an empty SCAN result', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([])

    await expect(hydrateInvalidTokensFromRedis(cache, scanner)).resolves.toBe(0)
  })
})

describe('hydrateInvalidTokensFromDb', () => {
  it('seeds both providerAccountId and userId from each requires_refresh row', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = {
      data: [
        { providerAccountId: 'tw-1', userId: 'user-1' },
        { providerAccountId: 'tw-2', userId: 'user-2' },
      ],
      error: null,
    }

    const count = await hydrateInvalidTokensFromDb(cache)

    expect(count).toBe(4)
    expect(cache.has('tw-1')).toBeTruthy()
    expect(cache.has('user-1')).toBeTruthy()
    expect(cache.has('tw-2')).toBeTruthy()
    expect(cache.has('user-2')).toBeTruthy()
  })

  it('ignores null / empty fields without crashing', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = {
      data: [
        { providerAccountId: 'tw-only', userId: null },
        { providerAccountId: null, userId: 'user-only' },
        { providerAccountId: '', userId: '' },
      ],
      error: null,
    }

    const count = await hydrateInvalidTokensFromDb(cache)

    // Only the two non-null/non-empty values increment the counter.
    expect(count).toBe(2)
    expect(cache.has('tw-only')).toBeTruthy()
    expect(cache.has('user-only')).toBeTruthy()
  })

  it('returns 0 and logs at error level when supabase returns an error', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = { data: null, error: { message: 'supabase down' } }

    const count = await hydrateInvalidTokensFromDb(cache)

    expect(count).toBe(0)
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] invalidTokens DB hydrate failed')
    ).toBeTruthy()
  })

  it('returns 0 for an empty data array', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = { data: [], error: null }

    await expect(hydrateInvalidTokensFromDb(cache)).resolves.toBe(0)
  })

  it('does not double-add ids that are already in the cache', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    cache.hydrate('tw-dup')
    dbState.tableResults.accounts = {
      data: [{ providerAccountId: 'tw-dup', userId: 'user-new' }],
      error: null,
    }

    const count = await hydrateInvalidTokensFromDb(cache)

    expect(count).toBe(1)
    expect(cache.has('user-new')).toBeTruthy()
  })

  it('issues Redis writeback for newly-discovered DB invalids so future boots can SCAN them', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = {
      data: [{ providerAccountId: 'tw-fresh', userId: 'user-fresh' }],
      error: null,
    }

    await hydrateInvalidTokensFromDb(cache)
    await flushMicrotasks()

    expect(calls).toStrictEqual([
      { key: `${REDIS_KEY_PREFIX}tw-fresh`, op: 'setEx', ttl: TTL_SECONDS, value: '1' },
      { key: `${REDIS_KEY_PREFIX}user-fresh`, op: 'setEx', ttl: TTL_SECONDS, value: '1' },
    ])
  })

  it('skips Redis writeback for DB ids that the cache already holds (preserves existing TTL)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    cache.hydrate('tw-already-cached')
    cache.hydrate('user-already-cached')
    dbState.tableResults.accounts = {
      data: [{ providerAccountId: 'tw-already-cached', userId: 'user-already-cached' }],
      error: null,
    }

    const count = await hydrateInvalidTokensFromDb(cache)
    await flushMicrotasks()

    // Neither id was newly-added → no setEx writeback → existing Redis TTL preserved.
    expect(count).toBe(0)
    expect(calls).toStrictEqual([])
  })

  it('logs at error level (not info) when the DB hydrate throws', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    // Inject a thenable that rejects to force the outer catch.
    dbState.tableResults.accounts = null
    const { supabase } = await import('@dotabod/shared-utils')
    const originalFrom = supabase.from
    supabase.from = () => {
      throw new Error('synchronous explode')
    }
    try {
      const count = await hydrateInvalidTokensFromDb(cache)
      expect(count).toBe(0)
      expect(
        dbState.loggerErrorCalls.some((c) => c.message === '[USER] invalidTokens DB hydrate threw')
      ).toBeTruthy()
    } finally {
      supabase.from = originalFrom
    }
  })
})
