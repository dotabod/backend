import { chatSubIds } from './chatSubIds.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces.js'
import { logger } from './twitch/lib/logger.js'

// Constants
const headers = await getTwitchHeaders()

export async function fetchExistingSubscriptions() {
  let cursor: string | undefined
  do {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
    url.searchParams.append('type', 'channel.chat.message')
    if (cursor) url.searchParams.append('after', cursor)

    const subsReq = await fetch(url.toString(), {
      method: 'GET',
      headers,
    })

    const { data, pagination } = (await subsReq.json()) as TwitchEventSubSubscriptionsResponse

    // Store chat message subscriptions
    data
      .filter((sub) => sub.type === 'channel.chat.message')
      .forEach((sub) => {
        chatSubIds[sub.condition.broadcaster_user_id as string] = sub
      })

    cursor = pagination?.cursor
  } while (cursor)

  logger.info('[TWITCHEVENTS] Loaded existing chat subscriptions', {
    count: Object.keys(chatSubIds).length,
  })
}
