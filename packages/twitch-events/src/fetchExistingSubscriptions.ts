import { eventSubMap } from './chatSubIds'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces'
import { logger } from './twitch/lib/logger'
import { rateLimiter } from './utils/rateLimiter'
import { getTwitchHeaders } from './getTwitchHeaders.js'

// Constants
const headers = await getTwitchHeaders()
export const subsToCleanup: string[] = []
let fetchedCount = 0

export async function fetchExistingSubscriptions() {
  logger.info('[TWITCHEVENTS] Fetching existing subscriptions')
  let cursor: string | undefined
  do {
    await rateLimiter.schedule(async () => {
      const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
      if (cursor) url.searchParams.append('after', cursor)

      const subsReq = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      // Update rate limit info
      rateLimiter.updateLimits(subsReq.headers)

      if (subsReq.status === 429) {
        logger.warn('Rate limit hit, will retry automatically')
        throw new Error('Rate limit hit')
      }

      const { data, pagination } = (await subsReq.json()) as TwitchEventSubSubscriptionsResponse

      // Store subscriptions in eventSubMap, organizing by broadcaster ID
      data.forEach((sub) => {
        const broadcasterId = (sub.condition.broadcaster_user_id || sub.condition.user_id) as
          | string
          | undefined
        if (!broadcasterId || sub.transport.method === 'webhook') {
          subsToCleanup.push(sub.id)
          return
        }

        // Initialize broadcaster entry if it doesn't exist
        eventSubMap[broadcasterId] ??= {} as (typeof eventSubMap)[number]

        // Store subscription details
        eventSubMap[broadcasterId][sub.type] = {
          id: sub.id,
          status: sub.status,
        }

        fetchedCount++
        if (fetchedCount % 100 === 0) {
          logger.info('[TWITCHEVENTS] Fetch progress', {
            processed: fetchedCount,
            cleanupNeeded: subsToCleanup.length,
            queueStatus: rateLimiter.rateLimitStatus,
          })
        }
      })

      cursor = pagination?.cursor
    })
  } while (cursor)

  logger.info('[TWITCHEVENTS] Loaded existing subscriptions', {
    count: Object.keys(eventSubMap).length,
    cleanupNeeded: subsToCleanup.length,
    queueStatus: rateLimiter.rateLimitStatus,
  })
}
