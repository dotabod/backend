import { getTwitchHeaders } from '@dotabod/shared-utils'
import { logger } from '@dotabod/shared-utils'
import { fetchConduitId } from '../fetchConduitId.js'
import { rateLimiter } from './rateLimiterCore.js'

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
        // We'll need to implement resubscription elsewhere to avoid circular dependencies
        logger.info('Need to resubscribe', { userId, conduitId })
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

    interface TwitchResponse {
      data: TwitchSubscription[]
      total: number
      pagination?: {
        cursor?: string
      }
    }

    const result = (await response.json()) as TwitchResponse
    logger.info(`Found ${result.data.length} subscriptions for user`, { userId })

    // Process and analyze subscriptions here
    // Logic for checking and fixing subscriptions will be implemented elsewhere
    // to avoid circular dependencies
  } catch (error) {
    logger.error('Error checking subscriptions', {
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
