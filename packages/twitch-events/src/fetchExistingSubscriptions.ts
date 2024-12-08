import { eventSubMap } from './chatSubIds.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces.js'
import { logger } from './twitch/lib/logger.js'

// Constants
const headers = await getTwitchHeaders()

export async function fetchExistingSubscriptions() {
  let cursor: string | undefined
  do {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    if (cursor) url.searchParams.append('after', cursor)

    const subsReq = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const { data, pagination } = (await subsReq.json()) as TwitchEventSubSubscriptionsResponse

    // Store subscriptions
    data.forEach((sub) => {
      eventSubMap[sub.condition.broadcaster_user_id as string][sub.type] = {
        id: sub.id,
        status: sub.status,
      }
    })

    cursor = pagination?.cursor
  } while (cursor)

  logger.info('[TWITCHEVENTS] Loaded existing subscriptions', {
    count: Object.keys(eventSubMap).length,
  })
}
