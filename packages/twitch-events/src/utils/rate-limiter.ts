import { getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { z } from 'zod'

const twitchResponseSchema = z.object({
  data: z.array(z.looseObject({ id: z.string() })),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
  total: z.number(),
})

export const checkAndFixUserSubscriptions = async function checkAndFixUserSubscriptions(
  userId: string
): Promise<void> {
  try {
    logger.info('Checking subscription health for user', { userId })

    const headers = await getTwitchHeaders()

    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    url.searchParams.append('broadcaster_user_id', userId)

    const response = await fetch(url.toString(), {
      headers,
      method: 'GET',
    })

    if (response.status !== 200) {
      logger.error(`Failed to fetch subscriptions: ${response.status}`, { userId })
      return
    }

    const twitchResponse = twitchResponseSchema.parse(await response.json())
    logger.info(`Found ${twitchResponse.data.length} subscriptions for user`, { userId })
  } catch (error) {
    logger.error('Error checking subscriptions', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
  }
}

// (Previous ad-hoc CLI entry-point removed — see
// src/scripts/runSubscriptionHealthCheck.ts for the supported standalone
// invocation. Bundling a CommonJS entry-point gate into this ESM-with-TLA
// module crashes Node 24 with ERR_AMBIGUOUS_MODULE_SYNTAX at startup.)
