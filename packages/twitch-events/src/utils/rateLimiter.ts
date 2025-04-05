import { fetchConduitId } from '../fetchConduitId.js'
import { getTwitchHeaders } from '@dotabod/shared-utils'
import { logger } from '@dotabod/shared-utils'
import { genericSubscribe } from '../subscribeChatMessagesForUser.js'
import type { TwitchEventTypes } from '../TwitchEventTypes.js'

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

  private decrementRemaining() {
    this.rateLimitInfo.remaining = Math.max(0, this.rateLimitInfo.remaining - 1)
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
        } else {
          // Reset has passed, reset the remaining count
          this.rateLimitInfo.remaining = this.rateLimitInfo.limit
          this.rateLimitInfo.reset = now + 60000 // Default to 1 minute if we don't have a new reset time
        }
      }

      const task = this.queue.shift()
      if (task) {
        try {
          await task()
          this.decrementRemaining()
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
interface TwitchSubscriptionCondition {
  broadcaster_user_id?: string
  user_id?: string
  [key: string]: string | undefined
}

interface TwitchSubscriptionTransport {
  method: 'webhook' | 'websocket' | 'conduit'
  callback?: string
  secret?: string
  session_id?: string
  conduit_id?: string
}

interface TwitchSubscriptionRequest {
  type: string
  version: string
  condition: TwitchSubscriptionCondition
  transport: TwitchSubscriptionTransport
}

interface TwitchSubscription {
  id: string
  status: 'enabled' | 'webhook_callback_verification_pending' | string
  type: string
  version: string
  condition: TwitchSubscriptionCondition
  created_at: string
  transport: TwitchSubscriptionTransport & {
    connected_at?: string
  }
  cost: number
}

interface TwitchSubscriptionResponse {
  data: TwitchSubscription[]
  total: number
  total_cost: number
  max_total_cost: number
}

async function checkSubscriptionHealth(userId: string): Promise<void> {
  logger.info('Checking subscription health for user', { userId })
  try {
    const headers = await getTwitchHeaders()
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    url.searchParams.append('user_id', userId)

    const subscribeReq = await rateLimiter.schedule(() =>
      fetch(url.toString(), {
        method: 'GET',
        headers,
      }),
    )

    if (!subscribeReq.ok) {
      throw new Error(
        `Failed to fetch subscriptions: ${subscribeReq.status} ${await subscribeReq.text()}`,
      )
    }

    const response = (await subscribeReq.json()) as TwitchSubscriptionResponse

    console.log(response.data)

    // Check if stream.online subscription exists and is active for this user
    const sub = response.data.find(
      (s) =>
        s.type === 'stream.online' &&
        s.condition.broadcaster_user_id === userId &&
        s.status === 'enabled',
    )

    if (!sub) {
      // Resubscribe
      logger.warn('Missing stream.online subscription', { userId })
      try {
        const conduitId = await fetchConduitId()
        // await genericSubscribe(conduitId, userId, 'stream.online');
      } catch (conduitError) {
        logger.error('Failed to fetch conduit ID', {
          userId,
          error: conduitError instanceof Error ? conduitError.message : String(conduitError),
        })
      }
    } else {
      logger.info('stream.online subscription found', {
        userId,
        subscriptionId: sub.id,
        cost: sub.cost,
      })
    }
  } catch (error) {
    logger.error('Failed to check subscription health', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Check and repair subscriptions for a specific user
export async function checkAndFixUserSubscriptions(userId: string) {
  try {
    logger.info('Checking subscription health for user', { userId })

    // Get headers for API calls
    const headers = await getTwitchHeaders()

    // Fetch current subscriptions from Twitch API
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    url.searchParams.append('broadcaster_user_id', userId)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    if (response.status !== 200) {
      logger.error(`Failed to fetch subscriptions: ${response.status}`, { userId })
      return
    }

    interface TwitchSubscription {
      id: string
      status: string
      type: string
      version: string
      condition: Record<string, unknown>
      created_at: string
      transport: {
        method: string
        conduit_id?: string
      }
      cost: number
    }

    interface TwitchResponse {
      data: TwitchSubscription[]
      total: number
      pagination?: {
        cursor?: string
      }
    }

    const responseData = (await response.json()) as TwitchResponse
    console.log(responseData.data)

    // Check for missing subscription types
    const REQUIRED_TYPES = [
      'channel.chat.message',
      'stream.offline',
      'stream.online',
      'user.update',
      'channel.prediction.begin',
      'channel.prediction.progress',
      'channel.prediction.lock',
      'channel.prediction.end',
      'channel.poll.begin',
      'channel.poll.progress',
      'channel.poll.end',
    ]

    const existingTypes = responseData.data.map((sub) => sub.type)

    // Find missing subscription types
    const missingTypes = REQUIRED_TYPES.filter((type) => !existingTypes.includes(type))

    if (missingTypes.length > 0) {
      logger.warn('Missing subscriptions', { userId, missingTypes })

      // Get conduit ID for creating new subscriptions
      const conduitId = await fetchConduitId()

      // Create missing subscriptions
      for (const type of missingTypes) {
        try {
          logger.info(`Creating missing subscription: ${type}`, { userId })
          const result = await genericSubscribe(conduitId, userId, type as keyof TwitchEventTypes)
          logger.info(`Subscription creation result for ${type}`, { userId, result })
        } catch (error) {
          logger.error(`Failed to create subscription for ${type}`, {
            userId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } else {
      logger.info('All required subscriptions exist', { userId })
    }
  } catch (error) {
    logger.error('Error checking/fixing subscriptions', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// For CLI usage
if (require.main === module) {
  // Get user ID from command line arguments
  const userId = process.argv[2]
  if (!userId) {
    console.error('Please provide a user ID')
    process.exit(1)
  }

  // Example usage (commented out to prevent execution)
  await checkSubscriptionHealth(userId)
  // 40754777

  // checkAndFixUserSubscriptions(userId)
  //   .then(() => console.log('Subscription check completed'))
  //   .catch(console.error)
  //   .finally(() => process.exit(0))
}
