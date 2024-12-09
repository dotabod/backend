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

  updateLimits(headers: Headers) {
    const limit = headers.get('Ratelimit-Limit')
    const remaining = headers.get('Ratelimit-Remaining')
    const reset = headers.get('Ratelimit-Reset')

    if (limit) this.rateLimitInfo.limit = Number.parseInt(limit)
    if (remaining) this.rateLimitInfo.remaining = Number.parseInt(remaining)
    if (reset) this.rateLimitInfo.reset = Number.parseInt(reset) * 1000 // Convert to milliseconds
  }

  private async processQueue() {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      if (this.rateLimitInfo.remaining <= 0) {
        const now = Date.now()
        if (now < this.rateLimitInfo.reset) {
          const delay = this.rateLimitInfo.reset - now
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
