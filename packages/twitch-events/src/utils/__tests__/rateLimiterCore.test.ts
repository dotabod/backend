import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { RateLimiter, resetState } from '../../__tests__/sharedMocks.ts'

const makeHeaders = (h: Record<string, string>) => new Headers(h)
const realSetTimeout = globalThis.setTimeout

describe('RateLimiter', () => {
  beforeEach(() => {
    resetState()
  })

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout
  })

  describe('updateLimits', () => {
    it('parses limit/remaining and converts reset seconds to milliseconds', () => {
      const rl = new RateLimiter()
      const resetSeconds = 1_700_000_000
      rl.updateLimits(
        makeHeaders({
          'Ratelimit-Limit': '500',
          'Ratelimit-Remaining': '123',
          'Ratelimit-Reset': String(resetSeconds),
        }),
      )

      expect(rl.rateLimitStatus.limit).toBe(500)
      expect(rl.rateLimitStatus.remaining).toBe(123)
      expect(rl.rateLimitStatus.reset).toBe(resetSeconds * 1000)
    })

    it('leaves existing values untouched when headers are absent', () => {
      const rl = new RateLimiter()
      rl.updateLimits(makeHeaders({}))
      expect(rl.rateLimitStatus.limit).toBe(800)
      expect(rl.rateLimitStatus.remaining).toBe(800)
    })
  })

  describe('schedule', () => {
    it('resolves with the task result', async () => {
      const rl = new RateLimiter()
      await expect(rl.schedule(async () => 42)).resolves.toBe(42)
    })

    it('rejects when the task rejects', async () => {
      const rl = new RateLimiter()
      await expect(
        rl.schedule(async () => {
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')
    })

    it('runs queued tasks in FIFO order', async () => {
      const rl = new RateLimiter()
      const order: number[] = []
      await Promise.all([
        rl.schedule(async () => order.push(1)),
        rl.schedule(async () => order.push(2)),
        rl.schedule(async () => order.push(3)),
      ])
      expect(order).toEqual([1, 2, 3])
    })

    it('decrements remaining as tasks run', async () => {
      const rl = new RateLimiter()
      rl.updateLimits(makeHeaders({ 'Ratelimit-Remaining': '10' }))
      await rl.schedule(async () => undefined)
      await rl.schedule(async () => undefined)
      expect(rl.rateLimitStatus.remaining).toBe(8)
    })

    it('waits for reset then refills remaining when the budget is exhausted', async () => {
      // Fire the backoff timer immediately so the wait branch runs without real
      // elapsed time (and without depending on wall-clock arithmetic).
      globalThis.setTimeout = ((cb: () => void) => {
        cb()
        return 0 as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout

      const rl = new RateLimiter()
      // remaining 0, reset well in the future -> always takes the wait branch.
      rl.updateLimits(
        makeHeaders({
          'Ratelimit-Limit': '50',
          'Ratelimit-Remaining': '0',
          'Ratelimit-Reset': String(Math.ceil((Date.now() + 60_000) / 1000)),
        }),
      )

      const result = await rl.schedule(async () => 'done')
      expect(result).toBe('done')
      // After refill (50) and one task running, remaining is 49.
      expect(rl.rateLimitStatus.remaining).toBe(49)
    })

    it('refills immediately when the reset window has already passed', async () => {
      const rl = new RateLimiter()
      rl.updateLimits(
        makeHeaders({
          'Ratelimit-Limit': '30',
          'Ratelimit-Remaining': '0',
          'Ratelimit-Reset': String(Math.floor((Date.now() - 5000) / 1000)),
        }),
      )

      await rl.schedule(async () => undefined)
      expect(rl.rateLimitStatus.remaining).toBe(29)
    })
  })
})
