import { getTwitchHeaders, logger } from '@dotabod/shared-utils'

interface TwitchSubscription {
  id: string
  status: string
  type: string
  version: string
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

// (Previous ad-hoc CLI entry-point removed — see
// src/scripts/runSubscriptionHealthCheck.ts for the supported standalone
// invocation. Bundling a CommonJS entry-point gate into this ESM-with-TLA
// module crashes Node 24 with ERR_AMBIGUOUS_MODULE_SYNTAX at startup.)
