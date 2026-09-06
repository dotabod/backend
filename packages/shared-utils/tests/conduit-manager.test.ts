import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetUtilsState } from './setup-mocks.ts'

// The module reads TWITCH_CONDUIT_ID once at import time; clear it first so the
// env-override short-circuit doesn't bypass the fetch logic under test.
delete process.env.TWITCH_CONDUIT_ID

const { fetchConduitId, updateConduitShard } = await import('../src/twitch/conduit-manager')

interface FakeResponse {
  status?: number
  json?: unknown
  text?: string
}

let fetchQueue: FakeResponse[] = []
let fetchCallCount = 0

const skipRetryWait = async function skipRetryWait(): Promise<void> {
  await Promise.resolve()
}

const res = function res({ status = 200, json, text }: FakeResponse): Response {
  const body = json === undefined ? (text ?? '') : JSON.stringify(json)
  return new Response(body, {
    headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
    status,
    statusText: 'Status',
  })
}

describe('conduit manager', () => {
  beforeEach(() => {
    resetUtilsState()
    fetchQueue = []
    fetchCallCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      fetchCallCount += 1
      const next = fetchQueue.shift()
      if (!next) {
        throw new Error('Unexpected fetch call (queue empty)')
      }
      return await Promise.resolve(res(next))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchConduitId', () => {
    it('returns the first existing conduit id', async () => {
      fetchQueue = [{ json: { data: [{ id: 'existing-1', shard_count: 1 }] } }]
      await expect(fetchConduitId(true)).resolves.toBe('existing-1')
      expect(fetchCallCount).toBe(1)
    })

    it('creates a new conduit when none exist', async () => {
      fetchQueue = [
        // GET existing -> empty
        { json: { data: [] } },
        // POST create
        { json: { data: [{ id: 'created-1', shard_count: 1 }] } },
      ]
      await expect(fetchConduitId(true)).resolves.toBe('created-1')
      expect(fetchCallCount).toBe(2)
    })

    it('retries with fresh headers after a 401 and uses the retried result', async () => {
      fetchQueue = [{ status: 401 }, { json: { data: [{ id: 'retry-1', shard_count: 1 }] } }]
      await expect(fetchConduitId(true)).resolves.toBe('retry-1')
      expect(fetchCallCount).toBe(2)
    })

    it('returns null when the conduits request fails', async () => {
      fetchQueue = [{ status: 500, text: 'server error' }]
      await expect(fetchConduitId(true)).resolves.toBeNull()
    })

    it('serves the cached id without re-fetching when not forcing a refresh', async () => {
      fetchQueue = [{ json: { data: [{ id: 'cache-1', shard_count: 1 }] } }]
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
      fetchQueue = [{ json: {}, status: 202 }]
      await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBeTruthy()
    })

    it('returns false when the 202 response contains errors', async () => {
      fetchQueue = [{ json: { errors: [{ message: 'bad shard' }] }, status: 202 }]
      await expect(updateConduitShard('sess-1', 'conduit-1')).resolves.toBeFalsy()
    })

    it('retries after a 401 and succeeds on the next attempt', async () => {
      fetchQueue = [{ status: 401 }, { json: {}, status: 202 }]
      await expect(
        updateConduitShard('sess-1', 'conduit-1', 0, skipRetryWait)
      ).resolves.toBeTruthy()
      expect(fetchCallCount).toBe(2)
    })

    it('gives up after exhausting retries on persistent failures', async () => {
      fetchQueue = Array.from({ length: 6 }, () => ({ status: 500, text: 'nope' }))
      await expect(updateConduitShard('sess-1', 'conduit-1', 0, skipRetryWait)).resolves.toBeFalsy()
      // initial attempt + 5 retries
      expect(fetchCallCount).toBe(6)
    })
  })
})
