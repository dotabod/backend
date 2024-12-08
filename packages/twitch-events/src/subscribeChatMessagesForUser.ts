import { chatSubIds } from './chatSubIds.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import type { TwitchEventSubResponse } from './interfaces.js'
import { logger } from './twitch/lib/logger.js'

// Constants
const headers = await getTwitchHeaders()

const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (!botUserId) {
  throw new Error('Bot user id not found')
}

export async function subscribeChatMessagesForUser(
  conduit_id: string,
  broadcaster_user_id: string,
) {
  const body = {
    type: 'channel.chat.message',
    version: '1',
    condition: {
      user_id: botUserId,
      broadcaster_user_id: broadcaster_user_id, // the user we want to listen to
    },
    transport: {
      method: 'conduit',
      conduit_id,
    },
  }
  const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (subscribeReq.status !== 202) {
    logger.error(
      `Failed to subscribe to channel.chat.message ${
        subscribeReq.status
      } ${await subscribeReq.text()}`,
    )
    return false
  }

  const { data }: TwitchEventSubResponse = await subscribeReq.json()

  chatSubIds[broadcaster_user_id] = data[0]
  logger.info('[TWITCHEVENTS] added chatSubId', { broadcaster_user_id, chatSubId: data[0].id })
  return true
}
