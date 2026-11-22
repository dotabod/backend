import {
  botStatus,
  logger,
  updateConduitShard as sharedUpdateConduitShard,
} from '@dotabod/shared-utils'
import type { TwitchEventType } from '@dotabod/shared-utils/event-sub'

import { offlineEvent } from './event-handlers/offline-event'
import { onlineEvent } from './event-handlers/online-event'
import { transformBetData } from './event-handlers/transform-bet-data'
import { transformPollData } from './event-handlers/transform-poll-data'
import { updateUserEvent } from './event-handlers/update-user-event'
import { createEventSubInitializer } from './event-sub-initializer.js'
import { EventsubSocket, isEventsubConnected } from './event-sub-socket'
import { twitchEvent } from './events'
import { handleChatMessage } from './handle-chat'
import { emitEvent, hasDotabodSocket } from './utils/socket-manager'

const eventsSocket = twitchEvent

let currentSocket: EventsubSocket | null = null

// Startup-only retries left EventSub down until a manual restart when twitch-events
// was unavailable (2026-05-29). Retry on connect, including connects during a pending request.
export const ensureEventSubInitialized = createEventSubInitializer(
  eventsSocket,
  isEventsubConnected,
  async (reason) => {
    logger.info('[TWITCHCHAT] Ensuring EventSub is initialized', { reason })
    try {
      await initializeSocket()
    } catch (error) {
      logger.error('[TWITCHCHAT] EventSub initialization failed', {
        error: error instanceof Error ? error.message : String(error),
        reason,
      })
    }
  }
)

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

// Twitch can disconnect EventSub independently of the link to twitch-events.
const EVENTSUB_WATCHDOG_MS = 30_000
setInterval(() => {
  void ensureEventSubInitialized('watchdog')
}, EVENTSUB_WATCHDOG_MS)

const getConduitId = async function getConduitId(forceRefresh = false): Promise<string> {
  return await new Promise((resolve, reject) => {
    // Remove both listeners on any settle so repeated watchdog-driven retries
    // (while twitch-events is down) don't leak handlers / trip MaxListeners.
    const cleanup = () => {
      clearTimeout(timeout)
      eventsSocket.off('conduitData', onData)
      eventsSocket.off('conduitError', onError)
    }

    const onData = (data: { conduitId?: string }) => {
      cleanup()
      if (data.conduitId !== undefined && data.conduitId.length > 0) {
        logger.info('[TWITCHCHAT] Received conduit ID', {
          conduitId: `${data.conduitId.slice(0, 8)}...`,
        })
        resolve(data.conduitId)
      } else {
        reject(new Error('Invalid conduit data received'))
      }
    }

    const onError = (error: { error?: string }) => {
      cleanup()
      logger.error('[TWITCHCHAT] Error getting conduit ID', { error })
      reject(new Error(error.error ?? 'Unknown error getting conduit ID'))
    }

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for conduit data'))
    }, 15_000)

    eventsSocket.on('conduitData', onData)
    eventsSocket.on('conduitError', onError)

    logger.info('[TWITCHCHAT] Requesting conduit data', { forceRefresh })
    eventsSocket.emit('getConduitData', { forceRefresh })
  })
}

const updateConduitShard = async function updateConduitShard(
  session_id: string,
  conduitId: string,
  retryCount = 0
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
      const delay = Math.min(1000 * 2 ** retryCount, 30_000)
      logger.info(
        `[TWITCHCHAT] Retrying shard update after error in ${delay}ms, attempt ${retryCount + 1}`
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
      await updateConduitShard(session_id, conduitId, retryCount + 1)
      return
    }
  }
}

const legacyEventHandlerNames: Partial<Record<TwitchEventType, string>> = {
  'channel.poll.begin': 'subscribeToChannelPollBeginEvents',
  'channel.poll.end': 'subscribeToChannelPollEndEvents',
  'channel.poll.progress': 'subscribeToChannelPollProgressEvents',
  'channel.prediction.begin': 'subscribeToChannelPredictionBeginEvents',
  'channel.prediction.end': 'subscribeToChannelPredictionEndEvents',
  'channel.prediction.lock': 'subscribeToChannelPredictionLockEvents',
  'channel.prediction.progress': 'subscribeToChannelPredictionProgressEvents',
}

type OverlayEvent = ReturnType<typeof transformPollData> | ReturnType<typeof transformBetData>

const createEventHandler =
  <T>(type: TwitchEventType, transform: (event: T) => OverlayEvent) =>
  ({
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
    const data = transform(event)
    if (hasDotabodSocket()) {
      emitEvent(legacyEventHandlerNames[type] ?? type, broadcaster_user_id, data)
    }
  }

const grantEvent = function grantEvent(data: {
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
      payload: data.payload,
      twitchId: data.payload?.event?.user_id,
      userId,
      username: data.payload?.event?.user_login,
    })
    twitchEvent.emit('grant', userId)
  }
}

const revokeEvent = function revokeEvent(data: {
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
    logger.info('Revocation for user.authorization.revoke', { payload: data.payload, userId })
    if (userId === process.env.TWITCH_BOT_PROVIDERID) {
      logger.info('Bot was revoked in user.authorization.revoke!')
      botStatus.isBanned = true
    }
    twitchEvent.emit('revoke', userId)
  }
}

const eventHandlers = {
  'channel.chat.message': handleChatMessage,
  'channel.poll.begin': createEventHandler('channel.poll.begin', transformPollData),
  'channel.poll.end': createEventHandler('channel.poll.end', transformPollData),
  'channel.poll.progress': createEventHandler('channel.poll.progress', transformPollData),
  'channel.prediction.begin': createEventHandler('channel.prediction.begin', transformBetData),
  'channel.prediction.end': createEventHandler('channel.prediction.end', transformBetData),
  'channel.prediction.lock': createEventHandler('channel.prediction.lock', transformBetData),
  'channel.prediction.progress': createEventHandler(
    'channel.prediction.progress',
    transformBetData
  ),
  'stream.offline': offlineEvent,
  'stream.online': onlineEvent,
  'user.authorization.grant': grantEvent,
  'user.authorization.revoke': revokeEvent,
  'user.update': updateUserEvent,
} satisfies Partial<Record<TwitchEventType, (...args: never[]) => void | Promise<void>>>

const initializeSocket = async function initializeSocket() {
  try {
    const conduitId = await getConduitId()
    logger.info('[TWITCHCHAT] Using conduit ID from twitch-events service', {
      conduitId: `${conduitId.slice(0, 8)}...`,
    })

    // Exactly one live EventsubSocket at a time. Every re-init path (startup,
    // eventsSocket reconnect, watchdog, session_silenced) used to leak the
    // previous socket; thousands accumulated over ~10 days of uptime, each
    // reconnect-looping, and their combined connection rate got the bot 429'd by
    // Twitch (connection storm, 2026-06-19). Disposing the prior socket here —
    // only once we have a fresh conduit and are about to replace it — makes
    // every re-init idempotent. (If getConduitId() throws above we keep the
    // existing socket rather than tearing down a working connection.)
    currentSocket?.dispose()

    const mySocket = new EventsubSocket({
      disableAutoReconnect: false,
    })
    currentSocket = mySocket

    mySocket.on('connected', async (session_id: string) => {
      logger.info('[TWITCHCHAT] Socket connected (initial)', {
        conduitId: `${conduitId.slice(0, 8)}...`,
        sessionId: session_id,
      })
      await updateConduitShard(session_id, conduitId)
    })

    mySocket.on('reconnected', async (session_id: string) => {
      logger.info('[TWITCHCHAT] Socket reconnected', {
        conduitId: `${conduitId.slice(0, 8)}...`,
        sessionId: session_id,
      })
      await updateConduitShard(session_id, conduitId)
    })

    mySocket.on('close', (close: { code: number; reason?: string }) => {
      logger.info('[TWITCHCHAT] EventSub close event surfaced', {
        code: close?.code,
        reason: close?.reason,
      })
    })

    // Safety net: when Twitch goes silent the socket disables its own reconnect
    // (so it can't fight its replacement over the single conduit shard) and we
    // do one guarded re-init here. ensureEventSubInitialized's in-flight guard,
    // plus the dispose-on-reinit above, mean repeated silences can't pile up
    // sockets the way the old direct initializeSocket() call did.
    mySocket.on('session_silenced', () => {
      logger.warn('[TWITCHCHAT] session_silenced — re-initializing in 5s')
      setTimeout(() => {
        void ensureEventSubInitialized('session_silenced')
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

        const broadcasterUserId = payload.subscription?.condition?.broadcaster_user_id
        const eventUserId = payload.event?.user_id
        const conditionUserId = payload.subscription?.condition?.user_id
        const userId =
          broadcasterUserId !== undefined && broadcasterUserId.length > 0
            ? broadcasterUserId
            : eventUserId !== undefined && eventUserId.length > 0
              ? eventUserId
              : conditionUserId

        if (userId === undefined || userId.length === 0) {
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
          state = { hasEmitted: false, types: new Set([subscriptionType]), windowStart: now }
          userRevocationState.set(userId, state)
        } else {
          state.types.add(subscriptionType)
        }

        if (state.hasEmitted) {
          return
        }

        const isOnlyChatMessage = state.types.size === 1 && state.types.has('channel.chat.message')

        if (isOnlyChatMessage) {
          botStatus.isBanned = true
          logger.info('Bot was banned by Twitch! isOnlyChatMessage')
        } else {
          logger.info('Revocation with multiple types or non-chat type', {
            payload,
            types: [...state.types],
            userId,
          })
          twitchEvent.emit('revoke', userId)
        }
        state.hasEmitted = true
      }
    )

    Object.entries(eventHandlers).forEach(([event, handler]) => {
      mySocket.on(event, handler)
    })
  } catch (error) {
    logger.error('Exception when initializing socket', { error })
  }
}
