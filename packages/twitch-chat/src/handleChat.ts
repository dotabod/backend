import type { EventSubChannelChatMessageEventData } from '@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.external'
import type { EventSubChatBadge } from '@twurple/eventsub-base/lib/events/common/EventSubChatMessage.external'
import type { EventSubWsPacket } from '@twurple/eventsub-ws/lib/EventSubWsPacket.external'
import { t } from 'i18next'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { hasDotabodSocket, io } from './index'
import { logger } from './logger'

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

  return response.json() as Promise<TwitchChatMessageResponse>
}

/**
 * Handles incoming chat messages from the EventSub WebSocket
 * @param message The WebSocket message payload
 */
export async function handleChatMessage(message: EventSubWsPacket): Promise<void> {
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
