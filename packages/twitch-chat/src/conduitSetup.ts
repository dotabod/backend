import type { TwitchEventTypes } from './event-handlers/events'
import { offlineEvent } from './event-handlers/offlineEvent.js'
import { onlineEvent } from './event-handlers/onlineEvent.js'
import { transformBetData } from './event-handlers/transformBetData.js'
import { transformPollData } from './event-handlers/transformPollData.js'
import { updateUserEvent } from './event-handlers/updateUserEvent.js'
import { EventsubSocket } from './eventSubSocket.js'
import { twitchEvent } from './events.ts'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { handleChatMessage } from './handleChat'
import { hasDotabodSocket, io } from './index.js'
import { logger } from './logger.js'
import type {
  RevocationPayload,
  TwitchConduitCreateResponse,
  TwitchConduitResponse,
  TwitchConduitShardRequest,
  TwitchConduitShardResponse,
} from './types'

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
    io.to('twitch-chat-messages').emit('event', name, broadcasterId, data)
  }
}

const eventHandlers: Partial<Record<keyof TwitchEventTypes, (data: any) => void>> = {
  'stream.online': onlineEvent,
  'stream.offline': offlineEvent,
  'user.update': updateUserEvent,
  'channel.chat.message': handleChatMessage,
  'channel.prediction.begin': (data) => {
    const transformed = transformBetData(data)
    handleObsEvents('channel.prediction.begin', data.event.broadcaster_user_id, transformed)
  },
  'channel.prediction.progress': (data) => {
    const transformed = transformBetData(data)
    handleObsEvents('channel.prediction.progress', data.event.broadcaster_user_id, transformed)
  },
  'channel.prediction.lock': (data) => {
    const transformed = transformBetData(data)
    handleObsEvents('channel.prediction.lock', data.event.broadcaster_user_id, transformed)
  },
  'channel.prediction.end': (data) => {
    const transformed = transformBetData(data)
    handleObsEvents('channel.prediction.end', data.event.broadcaster_user_id, transformed)
  },
  'channel.poll.begin': (data) => {
    const transformed = transformPollData(data)
    handleObsEvents('channel.poll.begin', data.event.broadcaster_user_id, transformed)
  },
  'channel.poll.progress': (data) => {
    const transformed = transformPollData(data)
    handleObsEvents('channel.poll.progress', data.event.broadcaster_user_id, transformed)
  },
  'channel.poll.end': (data) => {
    const transformed = transformPollData(data)
    handleObsEvents('channel.poll.end', data.event.broadcaster_user_id, transformed)
  },
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

  mySocket.on('revocation', (payload: any) => {
    const revokePayload: RevocationPayload = payload
    const providerAccountId = revokePayload.subscription.condition.broadcaster_user_id
    twitchEvent.emit('revoke', providerAccountId)
  })

  Object.entries(eventHandlers).forEach(([event, handler]) => {
    mySocket.on(event, handler)
  })
}

export { initializeSocket }
