import type { RedisLike } from '../invalidTokens.ts'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

// dbMocks installs vi.doMock('@dotabod/shared-utils') at import time, so any
// downstream module that imports `supabase` / `logger` from shared-utils picks
// up the mock — but ONLY if those imports happen AFTER dbMocks loads. That's
// why every runtime symbol below is loaded via dynamic import. The `RedisLike`
// type-only import above gets erased and so doesn't trigger the eager load.
const { dbState, resetDbState } = await import('../../../db/__tests__/dbMocks.ts')

const {
  InvalidTokensCache,
  REDIS_KEY_PREFIX,
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
  opts: { isReady?: boolean; setExThrows?: boolean; delThrows?: boolean } = {},
) {
  const calls: RedisCall[] = []
  const client = {
    isReady: opts.isReady ?? true,
    setEx: async (key: string, ttl: number, value: string) => {
      calls.push({ op: 'setEx', key, ttl, value })
      if (opts.setExThrows) throw new Error('setEx failed')
      return 'OK'
    },
    del: async (key: string) => {
      calls.push({ op: 'del', key })
      if (opts.delThrows) throw new Error('del failed')
      return 1
    },
  } as unknown as RedisLike
  return { client, calls }
}

const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0))

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

    expect(cache.has('')).toBe(true)
    expect(cache.has(null)).toBe(true)
    expect(cache.has(undefined)).toBe(true)
    expect(cache.has(0)).toBe(true)
    expect(cache.has('not-seeded')).toBe(false)
  })

  it('add() then has() returns true', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)

    cache.add('tok-1')
    expect(cache.has('tok-1')).toBe(true)
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

    expect(cache.delete('present')).toBe(true)
    expect(cache.delete('never-added')).toBe(false)
    expect(cache.has('present')).toBe(false)
  })

  it('clear() removes user-added entries but restores the pre-seeded falsy guards', () => {
    const { client } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)
    cache.add('a')
    cache.add('b')

    cache.clear()

    // User entries gone.
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(false)
    // Pre-seeded falsy guards restored so empty/undefined lookups still
    // short-circuit (mirrors production startup behavior, not the old Set's
    // permanently-wiped semantics).
    expect(cache.has('')).toBe(true)
    expect(cache.has(null)).toBe(true)
    expect(cache.has(undefined)).toBe(true)
    expect(cache.has(0)).toBe(true)
  })

  it('hydrate() seeds the in-memory Set without firing Redis writes', () => {
    const { client, calls } = makeFakeRedis()
    const cache = new InvalidTokensCache(() => client)

    cache.hydrate('seeded-1')
    cache.hydrate('seeded-2')

    expect(cache.has('seeded-1')).toBe(true)
    expect(cache.has('seeded-2')).toBe(true)
    expect(calls).toEqual([])
  })
})

describe('InvalidTokensCache → Redis side effects', () => {
  it('add(string) issues setEx with the prefixed key and 24h TTL when Redis is ready', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)

    cache.add('alice')

    await flushMicrotasks()
    expect(calls).toEqual([
      { op: 'setEx', key: `${REDIS_KEY_PREFIX}alice`, ttl: TTL_SECONDS, value: '1' },
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
    expect(calls).toEqual([{ op: 'del', key: `${REDIS_KEY_PREFIX}bob` }])
  })

  it('skips Redis writes when isReady is false (boot / test environments)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)

    cache.add('cold')
    cache.delete('cold')

    await flushMicrotasks()
    expect(calls).toEqual([])
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
    expect(calls).toEqual([])
  })

  it('logs warn (does not silently swallow) when Redis setEx/del reject so failures stay observable', async () => {
    const { client, calls } = makeFakeRedis({
      isReady: true,
      setExThrows: true,
      delThrows: true,
    })
    const cache = new InvalidTokensCache(() => client)

    cache.add('boom')
    cache.delete('boom')

    await flushMicrotasks()
    expect(calls.length).toBe(2)
    expect(cache.has('boom')).toBe(false)
    expect(
      dbState.loggerWarnCalls.some((c) => c.message === '[USER] invalidTokens redis setEx failed'),
    ).toBe(true)
    expect(
      dbState.loggerWarnCalls.some((c) => c.message === '[USER] invalidTokens redis del failed'),
    ).toBe(true)
  })

  it('lazy getClient re-reads the client on every call so test reassignments are visible', async () => {
    let activeClient = makeFakeRedis({ isReady: true }).client
    let activeCalls: RedisCall[] = []
    // Track calls on whichever client is currently active.
    activeClient.setEx = async (key: string, ttl: number, value: string) => {
      activeCalls.push({ op: 'setEx', key, ttl, value })
      return 'OK'
    }
    const cache = new InvalidTokensCache(() => activeClient)

    cache.add('first')
    await flushMicrotasks()
    expect(activeCalls.length).toBe(1)

    // Swap in a fresh client (simulates setupMocks.ts reassigning redisClient.client).
    const swapped = makeFakeRedis({ isReady: true }).client
    const swappedCalls: RedisCall[] = []
    swapped.setEx = async (key: string, ttl: number, value: string) => {
      swappedCalls.push({ op: 'setEx', key, ttl, value })
      return 'OK'
    }
    activeClient = swapped
    activeCalls = []

    cache.add('second')
    await flushMicrotasks()
    expect(swappedCalls.length).toBe(1)
    expect(swappedCalls[0]?.key).toBe(`${REDIS_KEY_PREFIX}second`)
  })

  it('addEphemeral seeds the in-memory Set but skips Redis entirely (for transient DB errors)', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)

    cache.addEphemeral('transient-token')

    await flushMicrotasks()
    expect(cache.has('transient-token')).toBe(true)
    expect(calls).toEqual([])
  })
})

describe('hydrateInvalidTokensFromRedis', () => {
  function makeScannerClient(keys: string[], opts: { throws?: boolean } = {}) {
    return {
      scanIterator: async function* () {
        if (opts.throws) throw new Error('scan exploded')
        for (const k of keys) yield k
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
    expect(cache.has('user-1')).toBe(true)
    expect(cache.has('twitch-2')).toBe(true)
    expect(cache.has('provider-3')).toBe(true)
  })

  it('skips empty-suffix keys defensively', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([REDIS_KEY_PREFIX, `${REDIS_KEY_PREFIX}real`])

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(1)
    expect(cache.has('real')).toBe(true)
  })

  it('does not double-count entries that are already in the cache', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    cache.hydrate('dupe')

    const scanner = makeScannerClient([`${REDIS_KEY_PREFIX}dupe`, `${REDIS_KEY_PREFIX}fresh`])

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(1)
    expect(cache.has('dupe')).toBe(true)
    expect(cache.has('fresh')).toBe(true)
  })

  it('uses cache.hydrate (no Redis writeback) so TTLs are preserved on boot', async () => {
    const { client, calls } = makeFakeRedis({ isReady: true })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([`${REDIS_KEY_PREFIX}preserve-me`])

    await hydrateInvalidTokensFromRedis(cache, scanner)

    // Crucial: if hydrate accidentally called add(), it would issue a setEx and
    // refresh the TTL on every boot, defeating the 24h expiry.
    expect(calls).toEqual([])
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
            next: () => Promise.reject(new Error('scan exploded')),
          }
        },
      }),
    }

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(0)
    expect(
      dbState.loggerErrorCalls.some(
        (c) => c.message === '[USER] invalidTokens hydrate Redis scan failed',
      ),
    ).toBe(true)
  })

  it('returns 0 and logs error when the client is not ready (skips the SCAN entirely)', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = {
      isReady: false,
      scanIterator: async function* () {
        yield `${REDIS_KEY_PREFIX}should-not-see-this`
      },
    }

    const count = await hydrateInvalidTokensFromRedis(cache, scanner)

    expect(count).toBe(0)
    expect(cache.has('should-not-see-this')).toBe(false)
    expect(
      dbState.loggerErrorCalls.some(
        (c) => c.message === '[USER] invalidTokens hydrate skipped: redis not ready',
      ),
    ).toBe(true)
  })

  it('returns 0 cleanly for an empty SCAN result', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    const scanner = makeScannerClient([])

    expect(await hydrateInvalidTokensFromRedis(cache, scanner)).toBe(0)
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
    expect(cache.has('tw-1')).toBe(true)
    expect(cache.has('user-1')).toBe(true)
    expect(cache.has('tw-2')).toBe(true)
    expect(cache.has('user-2')).toBe(true)
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
    expect(cache.has('tw-only')).toBe(true)
    expect(cache.has('user-only')).toBe(true)
  })

  it('returns 0 and logs at error level when supabase returns an error', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = { data: null, error: { message: 'supabase down' } }

    const count = await hydrateInvalidTokensFromDb(cache)

    expect(count).toBe(0)
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] invalidTokens DB hydrate failed'),
    ).toBe(true)
  })

  it('returns 0 for an empty data array', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()
    dbState.tableResults.accounts = { data: [], error: null }

    expect(await hydrateInvalidTokensFromDb(cache)).toBe(0)
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
    expect(cache.has('user-new')).toBe(true)
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

    expect(calls).toEqual([
      { op: 'setEx', key: `${REDIS_KEY_PREFIX}tw-fresh`, ttl: TTL_SECONDS, value: '1' },
      { op: 'setEx', key: `${REDIS_KEY_PREFIX}user-fresh`, ttl: TTL_SECONDS, value: '1' },
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
    expect(calls).toEqual([])
  })

  it('logs at error level (not info) when the DB hydrate throws', async () => {
    const { client } = makeFakeRedis({ isReady: false })
    const cache = new InvalidTokensCache(() => client)
    cache.clear()

    // Inject a thenable that rejects to force the outer catch.
    dbState.tableResults.accounts = null
    const supabase = (await import('@dotabod/shared-utils')).supabase as any
    const originalFrom = supabase.from
    supabase.from = () => {
      throw new Error('synchronous explode')
    }
    try {
      const count = await hydrateInvalidTokensFromDb(cache)
      expect(count).toBe(0)
      expect(
        dbState.loggerErrorCalls.some((c) => c.message === '[USER] invalidTokens DB hydrate threw'),
      ).toBe(true)
    } finally {
      supabase.from = originalFrom
    }
  })
})
