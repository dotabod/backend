import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { initUserSubscriptions } from './initUserSubscriptions.js'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces.js'
import { subscribeToAuthRevoke } from './subscribeChatMessagesForUser'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { logger } from './twitch/lib/logger.js'

// Constants
const headers = await getTwitchHeaders()
const conduitId = await fetchConduitId()

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

export async function subscribeToEvents() {
  logger.info('[TWITCHEVENTS] Subscribing to events')

  subscribeToAuthRevoke(conduitId, process.env.TWITCH_CLIENT_ID!)

  const accountIds = await getAccountIds()
  accountIds.forEach((providerAccountId) => {
    try {
      initUserSubscriptions(providerAccountId)
    } catch (e) {
      logger.info('[TWITCHEVENTS] could not sub', { e, providerAccountId })
    }
  })
}