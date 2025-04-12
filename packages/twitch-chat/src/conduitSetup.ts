import {
  botStatus,
  getTwitchHeaders,
  logger,
  updateConduitShard as sharedUpdateConduitShard,
} from '@dotabod/shared-utils'
import { io as socketClient } from 'socket.io-client'
import type { TwitchEventTypes } from './event-handlers/events.js'
import { offlineEvent } from './event-handlers/offlineEvent.js'
import { onlineEvent } from './event-handlers/onlineEvent.js'
import { transformBetData } from './event-handlers/transformBetData.js'
import { transformPollData } from './event-handlers/transformPollData.js'
import { updateUserEvent } from './event-handlers/updateUserEvent.js'
import { EventsubSocket } from './eventSubSocket.js'
import { twitchEvent } from './events.js'
import { handleChatMessage } from './handleChat.js'
import { emitEvent, hasDotabodSocket } from './utils/socketManager.js'

const headers = await getTwitchHeaders()

// Create a socket client to connect to the twitch-events service
const eventsSocket = twitchEvent

// Set up event handlers for the socket
eventsSocket.on('connect', () => {
  logger.info('[TWITCHCHAT] Connected to twitch-events service')
})

eventsSocket.on('connect_error', (error) => {
  logger.error('[TWITCHCHAT] Failed to connect to twitch-events service', {
    error: error.message,
  })
})

eventsSocket.on('disconnect', (reason) => {
  logger.info('[TWITCHCHAT] Disconnected from twitch-events service', { reason })
})

// Function to fetch conduit ID via socket.io
async function getConduitId(forceRefresh = false): Promise<string> {
  return new Promise((resolve, reject) => {
    // Set timeout for the request
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for conduit data'))
    }, 15000)

    // Set up one-time listeners for the response
    eventsSocket.once('conduitData', (data) => {
      clearTimeout(timeout)
      if (data?.conduitId) {
        logger.info('[TWITCHCHAT] Received conduit ID', {
          conduitId: `${data.conduitId.substring(0, 8)}...`,
        })
        resolve(data.conduitId)
      } else {
        reject(new Error('Invalid conduit data received'))
      }
    })

    eventsSocket.once('conduitError', (error) => {
      clearTimeout(timeout)
      logger.error('[TWITCHCHAT] Error getting conduit ID', { error })
      reject(new Error(error.error || 'Unknown error getting conduit ID'))
    })

    // Request the conduit data
    logger.info('[TWITCHCHAT] Requesting conduit data', { forceRefresh })
    eventsSocket.emit('getConduitData', { forceRefresh })
  })
}

/**
 * Updates a conduit shard with the given session ID
 * @param session_id - WebSocket session ID to use for transport
 * @param conduitId - ID of conduit to update
 */
async function updateConduitShard(
  session_id: string,
  conduitId: string,
  retryCount = 0,
): Promise<void> {
  try {
    const success = await sharedUpdateConduitShard(session_id, conduitId, retryCount)
    if (!success && retryCount < 5) {
      // If shared implementation failed but we still have retries left,
      // try getting a fresh conduit and retrying
      logger.info('[TWITCHCHAT] Shared conduit update failed, fetching fresh conduit')
      const freshConduitId = await getConduitId(true)
      return updateConduitShard(session_id, freshConduitId, retryCount + 1)
    }
  } catch (error) {
    logger.error('[TWITCHCHAT] Error updating conduit shard', { error })

    if (retryCount < 5) {
      const delay = Math.min(1000 * 2 ** retryCount, 30000)
      logger.info(
        `[TWITCHCHAT] Retrying shard update after error in ${delay}ms, attempt ${retryCount + 1}`,
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
      return updateConduitShard(session_id, conduitId, retryCount + 1)
    }
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
  try {
    // Get the conduit ID from the twitch-events service
    const conduitId = await getConduitId()
    logger.info('[TWITCHCHAT] Using conduit ID from twitch-events service', {
      conduitId: `${conduitId.substring(0, 8)}...`,
    })

    const mySocket = new EventsubSocket({
      disableAutoReconnect: false, // Ensure auto reconnect is enabled
    })

    mySocket.on('connected', async (session_id: string) => {
      logger.info(`Socket has connected ${session_id} for ${conduitId}`)
      await updateConduitShard(session_id, conduitId)
    })

    mySocket.on('error', (error: Error) => {
      logger.error('Socket Error', { error })
    })

    mySocket.on('close', (code: number, reason: string) => {
      logger.info(`Socket closed with code ${code} and reason: ${reason}`)

      // Handle specific close codes
      if (code === 4003) {
        logger.info('Connection unused, will reconnect when ready')
      }
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
  } catch (error) {
    logger.error('Exception when initializing socket', { error })
  }
}

export { initializeSocket }
