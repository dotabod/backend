import { getAppToken } from '@twurple/auth'
import type { EventSubSubscription } from '@twurple/eventsub-base'
import { listener } from './listener.js'
import { transformBetData } from './twitch/events/transformers/transformBetData.js'
import { transformPollData } from './twitch/events/transformers/transformPollData.js'
import { logger } from './twitch/lib/logger.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from './utils/socketUtils.js'

interface TwitchEventSubResponse {
  // A list that contains the single subscription that you created
  data: Array<{
    // An ID that identifies the subscription
    id: string
    // The subscription's status. Only enabled subscriptions receive events
    // Values: 'enabled' | 'webhook_callback_verification_pending'
    status: string
    // The subscription's type
    type: string
    // Version number identifying this subscription definition
    version: string
    // Subscription parameter values as JSON object
    condition: Record<string, unknown>
    // Creation date/time in RFC3339 format
    created_at: string
    // Transport details for notifications
    transport: {
      // Transport method: 'webhook' | 'websocket' | 'conduit'
      method: string
      // Webhook callback URL (webhook only)
      callback?: string
      // WebSocket session ID (websocket only)
      session_id?: string
      // WebSocket connection time UTC (websocket only)
      connected_at?: string
      // Conduit ID for notifications (conduit only)
      conduit_id?: string
    }
    // Subscription cost against limit
    cost: number
  }>
  // Total subscriptions created
  total: number
  // Sum of all subscription costs
  total_cost: number
  // Maximum allowed total cost
  max_total_cost: number
}

// Get all existing subscriptions by looping through pages
const chatSubIds: Record<string, TwitchEventSubResponse['data'][0]> = {}

// Constants
const headers = await getTwitchHeaders()

const botUserId = process.env.TWITCH_BOT_PROVIDERID
if (!botUserId) {
  throw new Error('Bot user id not found')
}

// Function to get Twitch headers
export async function getTwitchHeaders(): Promise<Record<string, string>> {
  const appToken = await getAppToken(
    process.env.TWITCH_CLIENT_ID || '',
    process.env.TWITCH_CLIENT_SECRET || '',
  )

  return {
    'Client-Id': process.env.TWITCH_CLIENT_ID || '',
    Authorization: `Bearer ${appToken?.accessToken}`,
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  }
}

const subscribeChatMessagesForUser = async (conduit_id: string, broadcaster_user_id: string) => {
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

export const handleEvent = (eventName: any, broadcasterId: string, data: any) => {
  if (!eventsIOConnected) {
    return
  }
  socketIo.to(DOTABOD_EVENTS_ROOM).emit('event', eventName, broadcasterId, data)
}

// Map to store subscriptions for each user
export const userSubscriptions: Record<string, Array<EventSubSubscription>> = {}

// Function to fetch conduit ID
async function fetchConduitId(): Promise<string> {
  const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'GET',
    headers,
  })

  const { data } = await conduitsReq.json()
  return data[0]?.id
}

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })
let cursor: string | undefined

do {
  const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
  url.searchParams.append('type', 'channel.chat.message')
  if (cursor) url.searchParams.append('after', cursor)

  const subsReq = await fetch(url.toString(), {
    method: 'GET',
    headers,
  })

  const { data, pagination } = await subsReq.json()
  data
    .filter((sub: any) => sub.type === 'channel.chat.message')
    .forEach((sub: any) => {
      chatSubIds[sub.condition.broadcaster_user_id] = sub
    })

  cursor = pagination?.cursor
} while (cursor)

logger.info('[TWITCHEVENTS] chatSubIds size', {
  chatSubIds: Object.keys(chatSubIds).length,
})

// Function to init subscriptions for a user
const initUserSubscriptions = async (providerAccountId: string) => {
  try {
    if (chatSubIds[providerAccountId]?.status !== 'enabled') {
      logger.info('[TWITCHEVENTS] chatSubIds[providerAccountId]?.status !== enabled')
      if (chatSubIds[providerAccountId]) {
        logger.info('[TWITCHEVENTS] deleting subscription', {
          id: chatSubIds[providerAccountId].id,
        })
        await fetch(
          `https://api.twitch.tv/helix/eventsub/subscriptions?id=${chatSubIds[providerAccountId].id}`,
          {
            method: 'DELETE',
            headers,
          },
        )
          .then(() => {
            logger.info('[TWITCHEVENTS] deleted subscription', {
              id: chatSubIds[providerAccountId].id,
            })
          })
          .catch((e) => {
            logger.info('[TWITCHEVENTS] could not delete subscription', {
              e,
              id: chatSubIds[providerAccountId].id,
            })
          })
        delete chatSubIds[providerAccountId]
      }
      await subscribeChatMessagesForUser(conduitId, providerAccountId)
    }
  } catch (e) {
    logger.info('[TWITCHEVENTS] could not sub', { e, providerAccountId })
  }
  const subscriptions = [
    listener.onStreamOnline(providerAccountId, onlineEvent),
    listener.onStreamOffline(providerAccountId, offlineEvent),
    listener.onUserUpdate(providerAccountId, updateUserEvent),
    listener.onChannelPredictionBegin(providerAccountId, (data) =>
      handleEvent('onChannelPredictionBegin', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionProgress(providerAccountId, (data) =>
      handleEvent('onChannelPredictionProgress', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionLock(providerAccountId, (data) =>
      handleEvent('onChannelPredictionLock', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionEnd(providerAccountId, (data) =>
      handleEvent('onChannelPredictionEnd', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPollBegin(providerAccountId, (data) =>
      handleEvent('onChannelPollBegin', providerAccountId, transformPollData(data)),
    ),
    listener.onChannelPollProgress(providerAccountId, (data) =>
      handleEvent('onChannelPollProgress', providerAccountId, transformPollData(data)),
    ),
    listener.onChannelPollEnd(providerAccountId, (data) =>
      handleEvent('onChannelPollEnd', providerAccountId, transformPollData(data)),
    ),
  ]

  userSubscriptions[providerAccountId] = subscriptions
}

// Function to stop subscriptions for a user
export const stopUserSubscriptions = (providerAccountId: string) => {
  const subscriptions = userSubscriptions[providerAccountId]
  if (subscriptions) {
    subscriptions.forEach((subscription) => subscription.stop())
    delete userSubscriptions[providerAccountId]
    logger.info(
      `[TWITCHEVENTS] Unsubscribed from events for providerAccountId: ${providerAccountId}`,
    )
  } else {
    logger.info(
      `[TWITCHEVENTS] stopUserSubscriptions No subscriptions found for providerAccountId: ${providerAccountId}`,
    )
  }

  // get the sub id from the subscription
  const subId = chatSubIds[providerAccountId].id
  if (subId) {
    // do a DELETE request to the chat subscription
    fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subId}`, {
      method: 'DELETE',
      headers,
    })
      .then(() => {
        delete chatSubIds[providerAccountId]
      })
      .catch((e) => {
        logger.info('[TWITCHEVENTS] could not delete subscription', { e, id: subId })
      })
  }
}

// Function to start subscriptions for a user
export const startUserSubscriptions = (providerAccountId: string) => {
  initUserSubscriptions(providerAccountId)
  logger.info(`[TWITCHEVENTS] Subscribed events for providerAccountId: ${providerAccountId}`)
}

// Function to subscribe to events for multiple users
export const SubscribeEvents = (accountIds: string[]) => {
  accountIds.forEach((providerAccountId) => {
    try {
      initUserSubscriptions(providerAccountId)
    } catch (e) {
      logger.info('[TWITCHEVENTS] could not sub', { e, providerAccountId })
    }
  })
}
