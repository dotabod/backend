import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { resetUtilsState } from './setupMocks.ts'

// The module reads TWITCH_CONDUIT_ID once at import time; clear it first so the
// env-override short-circuit doesn't bypass the fetch logic under test.
delete process.env.TWITCH_CONDUIT_ID

const { fetchConduitId, updateConduitShard } = await import('../src/twitch/conduitManager')

type FakeResponse = {
  status?: number
  json?: unknown
  text?: string
}

const realFetch = globalThis.fetch
const realSetTimeout = globalThis.setTimeout

let fetchQueue: FakeResponse[] = []
let fetchCallCount = 0

function res({ status = 200, json, text }: FakeResponse) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Status',
    json: async () => json,
    text: async () => text ?? '',
  }
}

beforeEach(() => {
  resetUtilsState()
  fetchQueue = []
  fetchCallCount = 0
  globalThis.fetch = (async () => {
    fetchCallCount++
    const next = fetchQueue.shift()
    if (!next) throw new Error('Unexpected fetch call (queue empty)')
    return res(next)
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  globalThis.setTimeout = realSetTimeout
})

describe('fetchConduitId', () => {
  it('returns the first existing conduit id', async () => {
    fetchQueue = [{ json: { data: [{ id: 'existing-1', shard_count: 1 }] } }]
    await expect(fetchConduitId(true)).resolves.toBe('existing-1')
    expect(fetchCallCount).toBe(1)
  })

  it('creates a new conduit when none exist', async () => {
    fetchQueue = [
      { json: { data: [] } }, // GET existing -> empty
      { json: { data: [{ id: 'created-1' }] } }, // POST create
    ]
    await expect(fetchConduitId(true)).resolves.toBe('created-1')
    expect(fetchCallCount).toBe(2)
  })

  it('retries with fresh headers after a 401 and uses the retried result', async () => {
    fetchQueue = [{ status: 401 }, { json: { data: [{ id: 'retry-1' }] } }]
    await expect(fetchConduitId(true)).resolves.toBe('retry-1')
    expect(fetchCallCount).toBe(2)
  })

  it('returns null when the conduits request fails', async () => {
    fetchQueue = [{ status: 500, text: 'server error' }]
    await expect(fetchConduitId(true)).resolves.toBeNull()
  })

  it('serves the cached id without re-fetching when not forcing a refresh', async () => {
    fetchQueue = [{ json: { data: [{ id: 'cache-1' }] } }]
    await expect(fetchConduitId(true)).resolves.toBe('cache-1')
    const callsAfterFirst = fetchCallCount

    await expect(fetchConduitId(false)).resolves.toBe('cache-1')
    expect(fetchCallCount).toBe(callsAfterFirst)
  })

  it('refetches after the 24h cache expiry instead of reusing the settled fetch promise', async () => {
    fetchQueue = [
      { json: { data: [{ id: 'stale-1', shard_count: 1 }] } },
      { json: { data: [{ id: 'fresh-1', shard_count: 1 }] } },
    ]
    await expect(fetchConduitId(true)).resolves.toBe('stale-1')
    expect(fetchCallCount).toBe(1)

    // Jump past CACHE_TIMEOUT (24h). The bug: the settled fetch promise was
    // never cleared on success, so this call returned the stale id forever.
    const realNow = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 25 * 60 * 60 * 1000)
    try {
      await expect(fetchConduitId(false)).resolves.toBe('fresh-1')
      expect(fetchCallCount).toBe(2)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('updateConduitShard', () => {
  it('returns true on a 202 with no errors', async () => {
    fetchQueue = [{ status: 202, json: {} }]
    await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBe(true)
  })

  it('returns false when the 202 response contains errors', async () => {
    fetchQueue = [{ status: 202, json: { errors: [{ message: 'bad shard' }] } }]
    await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBe(false)
  })

  it('retries after a 401 and succeeds on the next attempt', async () => {
    // Fire backoff timers immediately so the retry path runs without real delay.
    globalThis.setTimeout = ((cb: () => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    fetchQueue = [{ status: 401 }, { status: 202, json: {} }]
    await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBe(true)
    expect(fetchCallCount).toBe(2)
  })

  it('gives up after exhausting retries on persistent failures', async () => {
    globalThis.setTimeout = ((cb: () => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout

    fetchQueue = Array.from({ length: 6 }, () => ({ status: 500, text: 'nope' }))
    await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBe(false)
    // initial attempt + 5 retries
    expect(fetchCallCount).toBe(6)
  })
})
