import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { initUserSubscriptions } from './initUserSubscriptions.js'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces.js'
import { subscribeToAuthRevoke } from './subscribeChatMessagesForUser'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { logger } from './twitch/lib/logger.js'
import { rateLimiter } from './utils/rateLimiter.js'

// Constants
const headers = await getTwitchHeaders()

export const subsToCleanup: string[] = []

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
      })

      cursor = pagination?.cursor
    })
  } while (cursor)

  logger.info('[TWITCHEVENTS] Loaded existing subscriptions', {
    count: Object.keys(eventSubMap).length,
  })
}

export async function subscribeToEvents() {
  const conduitId = await fetchConduitId()
  logger.info('[TWITCHEVENTS] Subscribing to events', { conduitId })

  await subscribeToAuthRevoke(conduitId, process.env.TWITCH_CLIENT_ID!)

  const accountIds = await getAccountIds()
  // Process accounts in chunks to avoid overwhelming the rate limiter
  const CHUNK_SIZE = 10
  for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
    const chunk = accountIds.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (providerAccountId) => {
        try {
          await initUserSubscriptions(providerAccountId)
        } catch (e) {
          logger.info('[TWITCHEVENTS] could not sub', { e, providerAccountId })
        }
      }),
    )
  }
}
