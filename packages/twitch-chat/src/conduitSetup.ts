import {
  botStatus,
  getTwitchHeaders,
  logger,
  updateConduitShard as sharedUpdateConduitShard,
} from '@dotabod/shared-utils'
import type { TwitchEventTypes } from './event-handlers/events'
import { offlineEvent } from './event-handlers/offlineEvent'
import { onlineEvent } from './event-handlers/onlineEvent'
import { transformBetData } from './event-handlers/transformBetData'
import { transformPollData } from './event-handlers/transformPollData'
import { updateUserEvent } from './event-handlers/updateUserEvent'
import { EventsubSocket } from './eventSubSocket'
import { twitchEvent } from './events'
import { handleChatMessage } from './handleChat'
import { emitEvent, hasDotabodSocket } from './utils/socketManager'

const _headers = await getTwitchHeaders()

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

const handleObsEvents = (type: keyof TwitchEventTypes, broadcasterId: string, data: unknown) => {
  if (hasDotabodSocket()) {
    const name = legacyEventHandlerNames[type] || type
    emitEvent(name, broadcasterId, data)
  }
}

// Helper function to extract broadcaster ID and transform event data
const createEventHandler = <T, R>(type: keyof TwitchEventTypes, transform: (event: T) => R) => {
  return ({
    payload: {
      subscription: {
        condition: { broadcaster_user_id },
      },
      event,
    },
  }: {
    payload: {
      subscription: {
        condition: { broadcaster_user_id: string }
      }
      event: T
    }
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

// EventSub payloads aren't modeled centrally (TwitchEventTypes only carries versions);
// handlers stay typed at their definitions, so this registry holds them via `any`.
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
      logger.info('[TWITCHCHAT] Socket connected (initial)', {
        sessionId: session_id,
        conduitId: `${conduitId.substring(0, 8)}...`,
      })
      await updateConduitShard(session_id, conduitId)
    })

    mySocket.on('reconnected', async (session_id: string) => {
      logger.info('[TWITCHCHAT] Socket reconnected', {
        sessionId: session_id,
        conduitId: `${conduitId.substring(0, 8)}...`,
      })
      await updateConduitShard(session_id, conduitId)
    })

    mySocket.on('close', (close: { code: number; reason?: string }) => {
      logger.info('[TWITCHCHAT] EventSub close event surfaced', {
        code: close?.code,
        reason: close?.reason,
      })
    })

    // Safety net: if Twitch goes silent and the close path doesn't recover the
    // socket (we've seen the connection get stuck with eventsubConnected=false
    // and no log activity), force a full re-init.
    let silencedRecoveryInFlight = false
    mySocket.on('session_silenced', () => {
      if (silencedRecoveryInFlight) {
        logger.warn('[TWITCHCHAT] session_silenced fired again while recovery in flight')
        return
      }
      silencedRecoveryInFlight = true
      logger.warn('[TWITCHCHAT] session_silenced — forcing full re-init in 5s')
      setTimeout(() => {
        initializeSocket()
          .then(() => logger.info('[TWITCHCHAT] Re-init after silence completed'))
          .catch((e) =>
            logger.error('[TWITCHCHAT] Re-init after silence failed', { error: e?.message }),
          )
          .finally(() => {
            silencedRecoveryInFlight = false
          })
      }, 5000)
    })

    const DEBOUNCE_TIME = 3000
    const userRevocationState = new Map<
      string,
      { windowStart: number; types: Set<string>; hasEmitted: boolean }
    >()

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
        const subscriptionType = payload.subscription.type

        let state = userRevocationState.get(userId)
        if (!state || now - state.windowStart > DEBOUNCE_TIME) {
          state = { windowStart: now, types: new Set([subscriptionType]), hasEmitted: false }
          userRevocationState.set(userId, state)
        } else {
          state.types.add(subscriptionType)
        }

        if (state.hasEmitted) {
          return
        }

        const isOnlyChatMessage = state.types.size === 1 && state.types.has('channel.chat.message')

        if (!isOnlyChatMessage) {
          logger.info('Revocation with multiple types or non-chat type', {
            userId,
            types: Array.from(state.types),
            payload,
          })
          twitchEvent.emit('revoke', userId)
        } else {
          botStatus.isBanned = true
          logger.info('Bot was banned by Twitch! isOnlyChatMessage')
        }
        state.hasEmitted = true
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
