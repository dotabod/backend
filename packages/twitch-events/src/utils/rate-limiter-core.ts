import { setTimeout as delay } from 'node:timers/promises'

import { logger } from '@dotabod/shared-utils'
import pLimit from 'p-limit'

interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

interface RateLimitStatus extends RateLimitInfo {
  queueLength: number
}

export class RateLimiter {
  private readonly runOneAtATime = pLimit(1)
  private readonly rateLimitInfo: RateLimitInfo = {
    limit: 800,
    remaining: 800,
    reset: Date.now() + 60_000,
  }
  private readonly waitForReset: (delayMs: number) => Promise<void>

  constructor(waitForReset: (delayMs: number) => Promise<void> = delay) {
    this.waitForReset = waitForReset
  }

  get queueLength(): number {
    return this.runOneAtATime.pendingCount
  }

  get rateLimitStatus(): RateLimitStatus {
    return {
      ...this.rateLimitInfo,
      queueLength: this.queueLength,
    }
  }

  updateLimits(headers: Headers): void {
    const limit = headers.get('Ratelimit-Limit')
    const remaining = headers.get('Ratelimit-Remaining')
    const reset = headers.get('Ratelimit-Reset')

    if (limit !== null && limit.length > 0) {
      this.rateLimitInfo.limit = Math.trunc(Number(limit))
    }
    if (remaining !== null && remaining.length > 0) {
      this.rateLimitInfo.remaining = Math.trunc(Number(remaining))
    }
    if (reset !== null && reset.length > 0) {
      this.rateLimitInfo.reset = Math.trunc(Number(reset)) * 1000
    }

    logger.debug('[RateLimiter] Status', this.rateLimitStatus)
  }

  private decrementRemaining(): void {
    this.rateLimitInfo.remaining = Math.max(0, this.rateLimitInfo.remaining - 1)
  }

  private async waitForCapacity(): Promise<void> {
    if (this.rateLimitInfo.remaining > 0) {
      return
    }

    const now = Date.now()
    if (now >= this.rateLimitInfo.reset) {
      this.rateLimitInfo.remaining = this.rateLimitInfo.limit
      this.rateLimitInfo.reset = now + 60_000
      return
    }

    const delayMs = this.rateLimitInfo.reset - now
    logger.info('[RateLimiter] Rate limit reached, waiting...', {
      delay: Math.round(delayMs / 1000),
      queueLength: this.queueLength,
    })
    await this.waitForReset(delayMs)
    this.rateLimitInfo.remaining = this.rateLimitInfo.limit
  }

  private logQueueStatus(): void {
    if (this.queueLength % 100 === 0 && this.queueLength > 0) {
      logger.info('[RateLimiter] Queue status', {
        rateLimit: this.rateLimitInfo.remaining,
        remaining: this.queueLength,
      })
    }
  }

  private async runTask<T>(task: () => Promise<T>): Promise<T> {
    await this.waitForCapacity()
    try {
      const taskResult = await task()
      this.decrementRemaining()
      return taskResult
    } catch (error) {
      const taskError =
        error instanceof Error ? error : new Error('Rate limited task failed', { cause: error })
      logger.error('[RateLimiter] Task failed', { error: taskError.message })
      throw taskError
    } finally {
      this.logQueueStatus()
    }
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    return await this.runOneAtATime(async () => await this.runTask(task))
  }
}

export const rateLimiter = new RateLimiter()
