import type { EventSubChannelChatMessageEventData } from '@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.external'
import type { EventSubChatBadge } from '@twurple/eventsub-base/lib/events/common/EventSubChatMessage.external'
import type { EventSubWsPacket } from '@twurple/eventsub-ws/lib/EventSubWsPacket.external'
import { t } from 'i18next'
import { EventsubSocket } from './eventSubSocket.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { hasDotabodSocket, io } from './index.js'
import { logger } from './logger.js'

const headers = await getTwitchHeaders()

function extractUserInfo(
  badges: EventSubChatBadge[],
  broadcasterUserId: string,
  chatterUserId: string,
) {
  return {
    isMod: badges.some((badge) => badge.set_id === 'moderator'),
    isBroadcaster: broadcasterUserId === chatterUserId,
    isSubscriber: badges.some((badge) => badge.set_id === 'subscriber'),
    userId: chatterUserId,
  }
}

interface TwitchConduitResponse {
  data: Array<{
    id: string
    shard_count: number
  }>
}

interface TwitchConduitCreateResponse {
  data: Array<{
    /** Unique identifier for the created conduit */
    id: string
    /** Number of shards created for this conduit */
    shard_count: number
  }>
}

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
 * Transport details for a conduit shard
 */
interface TwitchConduitShardTransport {
  /** The transport method - either webhook or websocket */
  method: 'webhook' | 'websocket'
  /** The callback URL for webhook transport. Must use HTTPS and port 443 */
  callback?: string
  /** Secret used to verify webhook signatures. Must be 10-100 ASCII characters */
  secret?: string
  /** WebSocket session ID for websocket transport */
  session_id?: string
}

/**
 * Request body for updating conduit shards
 */
interface TwitchConduitShardRequest {
  /** ID of the conduit to update */
  conduit_id: string
  /** List of shards to update */
  shards: Array<{
    /** Numeric shard ID */
    id: number
    /** Transport configuration for this shard */
    transport: TwitchConduitShardTransport
  }>
}

/**
 * Response from updating conduit shards
 */
interface TwitchConduitShardResponse {
  /** List of successfully updated shards */
  data: Array<{
    /** Shard ID */
    id: string
    /** Current status of the shard */
    status:
      | 'enabled' // Shard is enabled and receiving events
      | 'webhook_callback_verification_pending' // Waiting for webhook URL verification
      | 'webhook_callback_verification_failed' // Webhook URL verification failed
      | 'notification_failures_exceeded' // Too many failed notification deliveries
      | 'websocket_disconnected' // Client closed connection
      | 'websocket_failed_ping_pong' // Client failed to respond to ping
      | 'websocket_received_inbound_traffic' // Client sent non-pong message
      | 'websocket_internal_error' // Server error
      | 'websocket_network_timeout' // Server write timeout
      | 'websocket_network_error' // Server network error
      | 'websocket_failed_to_reconnect' // Client failed to reconnect after Reconnect message
    /** Transport configuration for this shard */
    transport: {
      /** Transport method used */
      method: 'webhook' | 'websocket'
      /** Webhook callback URL if using webhook transport */
      callback?: string
      /** WebSocket session ID if using websocket transport */
      session_id?: string
      /** UTC timestamp when WebSocket connected */
      connected_at?: string
      /** UTC timestamp when WebSocket disconnected */
      disconnected_at?: string
    }
  }>
  /** List of shards that failed to update */
  errors?: Array<{
    /** ID of shard that failed */
    id: string
    /** Human readable error message */
    message: string
    /** Error code for the failure */
    code: string
  }>
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

  mySocket.on('channel.chat.message', handleChatMessage)
}

/**
 * Response codes for chat message API
 */
export enum ChatMessageResponseCode {
  Success = 200,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  UnprocessableEntity = 422,
}

/**
 * Drop reason for failed chat messages
 */
interface ChatMessageDropReason {
  /** Code indicating why message was dropped */
  code: string
  /** Human readable explanation for why message was dropped */
  message: string
}

/**
 * Response from sending a chat message
 */
interface TwitchChatMessageResponse {
  data: Array<{
    /** Unique ID of the sent message */
    message_id: string
    /** Whether message was successfully sent */
    is_sent: boolean
    /** Details if message was dropped */
    drop_reason?: ChatMessageDropReason
  }>
}

/**
 * Parameters for sending a chat message
 */
interface SendChatMessageParams {
  /** ID of the broadcaster whose chat room to send to */
  broadcaster_id: string
  /** ID of user sending the message (must match access token) */
  sender_id: string
  /** Message text to send (max 500 chars, can include emote names without colons) */
  message: string
  /** Optional ID of message being replied to */
  reply_parent_message_id?: string
}

/**
 * Sends a chat message to Twitch via the Helix API
 *
 * Requires app access token or user access token with user:write:chat scope.
 * App tokens also need user:bot scope from sender and channel:bot scope or mod status.
 *
 * @param params - The message parameters
 * @returns Promise resolving to the API response
 * @throws Error if the request fails
 */
export async function sendTwitchChatMessage(
  params: SendChatMessageParams,
): Promise<TwitchChatMessageResponse> {
  const url = 'https://api.twitch.tv/helix/chat/messages'
  const options = {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }

  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`Failed to send chat message: ${response.status}`)

  return response.json()
}

/**
 * Handles incoming chat messages from the EventSub WebSocket
 * @param message The WebSocket message payload
 */
async function handleChatMessage(message: EventSubWsPacket): Promise<void> {
  if (!('subscription' in message.payload && 'event' in message.payload)) {
    return
  }

  const event = message.payload.event as unknown as EventSubChannelChatMessageEventData
  const {
    chatter_user_login,
    chatter_user_id,
    message: { text },
    message_id,
    broadcaster_user_id: channelId,
    badges,
    broadcaster_user_login,
  } = event

  const userInfo = extractUserInfo(badges, channelId, chatter_user_id)

  if (hasDotabodSocket()) {
    emitChatMessage(broadcaster_user_login, chatter_user_login, text, {
      channelId,
      userInfo,
      messageId: message_id,
    })
    return
  }

  await dotabodOfflineHandler(text, channelId)
}

/**
 * Handles chat commands when dotabod socket is not available
 */
async function dotabodOfflineHandler(text: string, channelId: string): Promise<void> {
  if (text === '!ping') {
    try {
      await sendTwitchChatMessage({
        broadcaster_id: channelId,
        sender_id: process.env.TWITCH_BOT_PROVIDERID || '',
        message: t('rebooting', { emote: 'PauseChamp', lng: 'en' }),
      })
    } catch (e) {
      logger.error('Could not send rebooting message', { e })
    }
  }
}

/**
 * Emits chat message to connected sockets
 */
function emitChatMessage(
  broadcasterLogin: string,
  chatterLogin: string,
  text: string,
  metadata: {
    channelId: string
    userInfo: ReturnType<typeof extractUserInfo>
    messageId: string
  },
): void {
  io.to('twitch-chat-messages').emit('msg', broadcasterLogin, chatterLogin, text, metadata)
}

export { initializeSocket }
