import { beforeEach, describe, expect, it } from 'vitest'

import { RateLimiter, resetState } from '../../__tests__/shared-mocks.ts'

const makeHeaders = (h: Record<string, string>) => new Headers(h)

describe(RateLimiter, () => {
  beforeEach(() => {
    resetState()
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
        })
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
      await expect(rl.schedule(async () => await Promise.resolve(42))).resolves.toBe(42)
    })

    it('rejects when the task rejects', async () => {
      const rl = new RateLimiter()
      await expect(
        rl.schedule(async () => await Promise.reject(new Error('boom')))
      ).rejects.toThrow('boom')
    })

    it('runs queued tasks in FIFO order', async () => {
      const rl = new RateLimiter()
      const order: number[] = []
      await Promise.all([
        rl.schedule(async () => await Promise.resolve(order.push(1))),
        rl.schedule(async () => await Promise.resolve(order.push(2))),
        rl.schedule(async () => await Promise.resolve(order.push(3))),
      ])
      expect(order).toStrictEqual([1, 2, 3])
    })

    it('decrements remaining as tasks run', async () => {
      const rl = new RateLimiter()
      rl.updateLimits(makeHeaders({ 'Ratelimit-Remaining': '10' }))
      await rl.schedule(async () => {})
      await rl.schedule(async () => {})
      expect(rl.rateLimitStatus.remaining).toBe(8)
    })

    it('waits for reset then refills remaining when the budget is exhausted', async () => {
      const waitDurations: number[] = []
      const rl = new RateLimiter(async (delayMs) => {
        waitDurations.push(delayMs)
        await Promise.resolve()
      })
      rl.updateLimits(
        makeHeaders({
          'Ratelimit-Limit': '50',
          'Ratelimit-Remaining': '0',
          'Ratelimit-Reset': String(Math.ceil((Date.now() + 100) / 1000)),
        })
      )

      const result = await rl.schedule(async () => await Promise.resolve('done'))
      expect(result).toBe('done')
      expect(waitDurations).toHaveLength(1)
      expect(rl.rateLimitStatus.remaining).toBe(49)
    })

    it('refills immediately when the reset window has already passed', async () => {
      const rl = new RateLimiter()
      rl.updateLimits(
        makeHeaders({
          'Ratelimit-Limit': '30',
          'Ratelimit-Remaining': '0',
          'Ratelimit-Reset': String(Math.floor((Date.now() - 5000) / 1000)),
        })
      )

      await rl.schedule(async () => {})
      expect(rl.rateLimitStatus.remaining).toBe(29)
    })
  })
})
