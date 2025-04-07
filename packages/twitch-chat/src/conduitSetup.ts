import { botStatus, logger, getTwitchHeaders } from '@dotabod/shared-utils'
import type { TwitchEventTypes } from './event-handlers/events'
import { offlineEvent } from './event-handlers/offlineEvent.js'
import { onlineEvent } from './event-handlers/onlineEvent.js'
import { transformBetData } from './event-handlers/transformBetData.js'
import { transformPollData } from './event-handlers/transformPollData.js'
import { updateUserEvent } from './event-handlers/updateUserEvent.js'
import { EventsubSocket } from './eventSubSocket.js'
import { twitchEvent } from './events.js'
import type {
  TwitchConduitCreateResponse,
  TwitchConduitResponse,
  TwitchConduitShardRequest,
  TwitchConduitShardResponse,
} from './types'
import { emitEvent, hasDotabodSocket } from './utils/socketManager.js'
import { handleChatMessage } from './handleChat'

const headers = await getTwitchHeaders()

// Function to fetch conduit ID
async function fetchConduitId(): Promise<string> {
  const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'GET',
    headers,
  })

  if (conduitsReq.status === 401) {
    throw new Error('Authorization header required with an app access token')
  }

  if (!conduitsReq.ok) {
    throw new Error(`Failed to fetch conduits: ${conduitsReq.status}`)
  }

  const { data } = (await conduitsReq.json()) as TwitchConduitResponse
  logger.info('Conduit ID', { data })
  return data[0]?.id || createConduit()
}

/**
 * Creates a new Twitch EventSub conduit
 * @returns Promise resolving to the created conduit ID
 * @throws Error if conduit creation fails
 */
async function createConduit(): Promise<string> {
  logger.info('Creating conduit')
  const createReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ shard_count: 1 }),
  })

  if (!createReq.ok) {
    throw new Error(`Failed to create conduit: ${createReq.status} ${await createReq.text()}`)
  }

  const { data } = (await createReq.json()) as TwitchConduitCreateResponse

  return data[0].id
}

/**
 * Updates a conduit shard with the given session ID
 * @param session_id - WebSocket session ID to use for transport
 * @param conduitId - ID of conduit to update
 */
async function updateConduitShard(session_id: string, conduitId: string): Promise<void> {
  const body: TwitchConduitShardRequest = {
    conduit_id: conduitId,
    shards: [
      {
        id: 0,
        transport: {
          method: 'websocket',
          session_id,
        },
      },
    ],
  }

  const conduitUpdate = await fetch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (conduitUpdate.status !== 202) {
    logger.error('Failed to assign socket to shard', { reason: await conduitUpdate.text() })
    return
  }

  logger.info('Socket assigned to shard')
  const response = (await conduitUpdate.json()) as TwitchConduitShardResponse
  if (response.errors && response.errors.length > 0) {
    logger.error('Failed to update the shard', { errors: response.errors })
  } else {
    logger.info('Shard Updated')
  }
}
const legacyEventHandlerNames: Partial<Record<keyof TwitchEventTypes, string>> = {
  'channel.prediction.begin': 'subscribeToChannelPredictionBeginEvents',
  'channel.prediction.progress': 'subscribeToChannelPredictionProgressEvents',
  'channel.prediction.lock': 'subscribeToChannelPredictionLockEvents',
  'channel.prediction.end': 'subscribeToChannelPredictionEndEvents',
  'channel.poll.begin': 'subscribeToChannelPollBeginEvents',
  'channel.poll.progress': 'subscribeToChannelPollProgressEvents',
  'channel.poll.end': 'subscribeToChannelPollEndEvents',
}

const handleObsEvents = (type: keyof TwitchEventTypes, broadcasterId: string, data: any) => {
  if (hasDotabodSocket()) {
    const name = legacyEventHandlerNames[type] || type
    emitEvent(name, broadcasterId, data)
  }
}

// Helper function to extract broadcaster ID and transform event data
const createEventHandler = (type: keyof TwitchEventTypes, transform: (event: any) => any) => {
  return ({
    payload: {
      subscription: {
        condition: { broadcaster_user_id },
      },
      event,
    },
  }) => {
    const transformed = transform(event)
    handleObsEvents(type, broadcaster_user_id, transformed)
  }
}

function grantEvent(data: {
  payload: {
    subscription: {
      id: string
      type: string
      version: string
      status: string
      cost: number
      condition: {
        client_id: string
      }
      transport: {
        method: string
        callback?: string
      }
      created_at: string
    }
    event: {
      client_id: string
      user_id: string
      user_login: string | null
      user_name: string | null
    }
  }
}) {
  const userId = data.payload?.event?.user_id
  if (userId === process.env.TWITCH_BOT_PROVIDERID) {
    logger.info('Bot was granted!')
    botStatus.isBanned = false
  }

  if (userId) {
    logger.info('Authorization granted for user', {
      userId,
      username: data.payload?.event?.user_login,
      twitchId: data.payload?.event?.user_id,
      payload: data.payload,
    })
    twitchEvent.emit('grant', userId)
  }
}

function revokeEvent(data: {
  payload: {
    subscription: {
      id: string
      type: string
      version: string
      status: string
      cost: number
      condition: {
        client_id: string
      }
      transport: {
        method: string
        callback?: string
      }
      created_at: string
    }
    event: {
      client_id: string
      user_id: string
      user_login: string | null
      user_name: string | null
    }
  }
}) {
  const userId = data.payload?.event?.user_id
  if (userId) {
    logger.info('Revocation for user.authorization.revoke', { userId, payload: data.payload })
    if (userId === process.env.TWITCH_BOT_PROVIDERID) {
      logger.info('Bot was revoked in user.authorization.revoke!')
      botStatus.isBanned = true
    }
    twitchEvent.emit('revoke', userId)
  }
}

const eventHandlers: Partial<Record<keyof TwitchEventTypes, (data: any) => void>> = {
  'stream.online': onlineEvent,
  'stream.offline': offlineEvent,
  'user.update': updateUserEvent,
  'channel.chat.message': handleChatMessage,
  'channel.prediction.begin': createEventHandler('channel.prediction.begin', transformBetData),
  'channel.prediction.progress': createEventHandler(
    'channel.prediction.progress',
    transformBetData,
  ),
  'channel.prediction.lock': createEventHandler('channel.prediction.lock', transformBetData),
  'channel.prediction.end': createEventHandler('channel.prediction.end', transformBetData),
  'channel.poll.begin': createEventHandler('channel.poll.begin', transformPollData),
  'channel.poll.progress': createEventHandler('channel.poll.progress', transformPollData),
  'channel.poll.end': createEventHandler('channel.poll.end', transformPollData),
  'user.authorization.revoke': revokeEvent,
  'user.authorization.grant': grantEvent,
}

// Initialize WebSocket and handle events
async function initializeSocket() {
  const conduitId = await fetchConduitId()
  logger.info('Conduit ID', { conduitId })

  const mySocket = new EventsubSocket()

  mySocket.on('connected', async (session_id: string) => {
    logger.info(`Socket has connected ${session_id} for ${conduitId}`)
    await updateConduitShard(session_id, conduitId)
  })

  mySocket.on('error', (error: Error) => {
    logger.error('Socket Error', { error })
  })

  // Track last revocation time for each user to implement debouncing
  const lastRevocationTime = new Map<string, number>()
  const DEBOUNCE_TIME = 3000 // 3 seconds debounce

  // Track subscription types received per user during debounce period
  const userSubscriptionTypes = new Map<string, Set<string>>()

  mySocket.on(
    'revocation',
    ({
      payload,
    }: {
      payload: {
        subscription: {
          condition: {
            broadcaster_user_id?: string
            user_id?: string
          }
          cost: number
          created_at: string
          id: string
          status: string
          transport: {
            conduit_id: string
            method: string
          }
          type: string
          version: number
        }
        event?: {
          user_id: string
        }
      }
    }) => {
      // Twitch sent 8k revocations for the bot when the bot got banned
      // The user_id was the bot
      // The broadcaster_user_id was the streamer

      const userId =
        payload.subscription?.condition?.broadcaster_user_id ||
        payload?.event?.user_id ||
        payload.subscription?.condition?.user_id

      if (!userId) {
        logger.info('No user_id or broadcaster_user_id found in revocation event', { payload })
        return
      }

      if (
        payload.subscription.type === 'channel.chat.message' &&
        payload.subscription?.condition?.user_id === process.env.TWITCH_BOT_PROVIDERID &&
        payload.subscription.condition.broadcaster_user_id === process.env.TWITCH_BOT_PROVIDERID
      ) {
        logger.info('Bot was banned by Twitch! Checked the in-memory bot status')
        botStatus.isBanned = true
        twitchEvent.emit('revoke', process.env.TWITCH_BOT_PROVIDERID)
        return
      }

      const now = Date.now()
      const lastTime = lastRevocationTime.get(userId) || 0
      const subscriptionType = payload.subscription.type

      // Check if we're still within a debounce period for this user
      if (now - lastTime <= DEBOUNCE_TIME) {
        // Add this subscription type to the set for this user
        if (!userSubscriptionTypes.has(userId)) {
          userSubscriptionTypes.set(userId, new Set())
        }
        userSubscriptionTypes.get(userId)?.add(subscriptionType)
      } else {
        // Outside debounce period, reset tracking for this user
        userSubscriptionTypes.set(userId, new Set([subscriptionType]))
        lastRevocationTime.set(userId, now)
      }

      // Only emit if either:
      // 1. We have multiple subscription types within the debounce period, or
      // 2. The subscription type is not 'channel.chat.message'
      const subscriptionTypes = userSubscriptionTypes.get(userId) || new Set()
      const hasMultipleTypes = subscriptionTypes.size > 1
      const isOnlyChatMessage =
        subscriptionTypes.size === 1 && subscriptionTypes.has('channel.chat.message')

      if (isOnlyChatMessage) {
        // Bot banned
        botStatus.isBanned = true
        logger.info('Bot was banned by Twitch! isOnlyChatMessage')
      }

      if (hasMultipleTypes || !isOnlyChatMessage) {
        logger.info('Revocation with multiple types or non-chat type', {
          userId,
          types: Array.from(subscriptionTypes),
          payload,
        })
        twitchEvent.emit('revoke', userId)
      } else {
        logger.info('Skipping revoke emit for single chat.message revocation', {
          userId,
          type: subscriptionType,
        })
      }
    },
  )

  Object.entries(eventHandlers).forEach(([event, handler]) => {
    mySocket.on(event, handler)
  })
}

export { initializeSocket }
