import { logger } from '../twitch/lib/logger.js'

interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

class RateLimiter {
  private queue: Array<() => Promise<any>> = []
  private processing = false
  private rateLimitInfo: RateLimitInfo = {
    limit: 800, // Default limit
    remaining: 800,
    reset: Date.now() + 60000, // Default 1 minute reset
  }

  get queueLength() {
    return this.queue.length
  }

  get rateLimitStatus() {
    return {
      ...this.rateLimitInfo,
      queueLength: this.queueLength,
    }
  }

  updateLimits(headers: Headers) {
    const limit = headers.get('Ratelimit-Limit')
    const remaining = headers.get('Ratelimit-Remaining')
    const reset = headers.get('Ratelimit-Reset')

    if (limit) this.rateLimitInfo.limit = Number.parseInt(limit)
    if (remaining) this.rateLimitInfo.remaining = Number.parseInt(remaining)
    if (reset) this.rateLimitInfo.reset = Number.parseInt(reset) * 1000 // Convert to milliseconds

    // Log rate limit status when it changes
    logger.debug('[RateLimiter] Status', this.rateLimitStatus)
  }

  private async processQueue() {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      if (this.rateLimitInfo.remaining <= 0) {
        const now = Date.now()
        if (now < this.rateLimitInfo.reset) {
          const delay = this.rateLimitInfo.reset - now
          logger.info('[RateLimiter] Rate limit reached, waiting...', {
            delay: Math.round(delay / 1000),
            queueLength: this.queueLength,
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
          this.rateLimitInfo.remaining = this.rateLimitInfo.limit
        }
      }

      const task = this.queue.shift()
      if (task) {
        try {
          await task()
        } catch (error) {
          console.error('Rate limited task failed:', error)
        }
      }

      // Log queue status every 100 tasks
      if (this.queue.length % 100 === 0 && this.queue.length > 0) {
        logger.info('[RateLimiter] Queue status', {
          remaining: this.queue.length,
          rateLimit: this.rateLimitInfo.remaining,
        })
      }
    }

    this.processing = false
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.processQueue()
    })
  }
}

export const rateLimiter = new RateLimiter()
