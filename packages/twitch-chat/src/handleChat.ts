import { checkBotStatus, getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { emitChatMessage, hasDotabodSocket } from './utils/socketManager.js'

function extractUserInfo(
  badges: {
    [key: string]: string
  }[],
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
  // Only the bot can send messages
  // Or a user with "user:bot" scope
  const headers = await getTwitchHeaders(params.sender_id)
  const options = {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }

  try {
    const response = await fetch(url, options)

    if (!response.ok) {
      let errorMessage = `Failed to send chat message: ${response.status} ${response.statusText}`
      let dropReasonCode = 'send_error'

      // Handle rate limiting specifically
      if (response.status === 429) {
        dropReasonCode = 'rate_limited'
        errorMessage = `Rate limited: ${response.status} ${response.statusText}`
      }

      // Try to read the response body for more details
      try {
        const errorBody = await response.text()
        if (errorBody) {
          errorMessage += ` - ${errorBody}`
        }
      } catch {
        // If we can't read the body, continue with the basic error
      }

      return {
        data: [
          {
            message_id: '',
            is_sent: false,
            drop_reason: {
              code: dropReasonCode,
              message: errorMessage,
            },
          },
        ],
      }
    }

    return response.json() as Promise<TwitchChatMessageResponse>
  } catch (error) {
    // If it's not an HTTP error we already handled, log and return a formatted error
    logger.error('Error sending chat message', { error, broadcaster_id: params.broadcaster_id })

    return {
      data: [
        {
          message_id: '',
          is_sent: false,
          drop_reason: {
            code: 'send_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      ],
    }
  }
}

/**
 * Handles incoming chat messages from the EventSub WebSocket
 * @param message The WebSocket message payload
 */
export async function handleChatMessage(message: any): Promise<void> {
  if (!('subscription' in message.payload && 'event' in message.payload)) {
    return
  }

  const event = message.payload.event
  const {
    chatter_user_login,
    chatter_user_id,
    message: { text },
    message_id,
    broadcaster_user_id: channelId,
    badges,
    reply,
    broadcaster_user_login,
  } = event

  if (event.source_message_id !== null) {
    // Ignore
    return
  }

  let messageText = text

  // If its a reply and has a command, remove the reply text from the message
  if (messageText.startsWith('@') && messageText.includes('!')) {
    // Remove the first word from the message (usually starting with @)
    messageText = messageText.replace(/^[^ ]+/, '').trim()
  }

  const userInfo = extractUserInfo(badges, channelId, chatter_user_id)

  if (hasDotabodSocket()) {
    emitChatMessage(broadcaster_user_login, chatter_user_login, messageText, {
      channelId,
      userInfo,
      messageId: reply?.parent_message_id || message_id,
    })
    return
  }

  await dotabodOfflineHandler(messageText, channelId, reply?.parent_message_id || message_id)
}

/**
 * Handles chat commands when dotabod socket is not available
 */
async function dotabodOfflineHandler(
  text: string,
  channelId: string,
  reply_parent_message_id?: string,
): Promise<void> {
  const isBanned = await checkBotStatus()
  if (isBanned) {
    return
  }

  if (text === '!ping') {
    try {
      await sendTwitchChatMessage({
        reply_parent_message_id,
        broadcaster_id: channelId,
        sender_id: process.env.TWITCH_BOT_PROVIDERID || '',
        message: t('rebooting', { emote: 'PauseChamp', lng: 'en' }),
      })
    } catch (e) {
      logger.error('Could not send rebooting message', { e })
    }
  }
}
