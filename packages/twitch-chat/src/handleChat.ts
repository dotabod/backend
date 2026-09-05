import { checkBotStatus, getTwitchHeaders, logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { isBroadcasterBeingDisabled } from './disableCache'
import { emitChatMessage, hasDotabodSocket } from './utils/socketManager'

// Cache for deduplicating chat messages
const messageDedupeCache = new Map<string, number>()
const DEDUPE_WINDOW_MS = 5000 // 5 seconds
const TWITCH_CHAT_MESSAGE_LIMIT = 500
const DUPLICATE_DISAMBIGUATOR = ' \u034F'

function fitTwitchChatMessage(message: string): string {
  if (message.length <= TWITCH_CHAT_MESSAGE_LIMIT) {return message}

  const trailingLink = (/ · (?:https?:\/\/)?\S+\.\S+(?: · .*)?$/.exec(message))?.[0] ?? ''
  const availableTextLength = TWITCH_CHAT_MESSAGE_LIMIT - trailingLink.length - 1
  if (availableTextLength <= 0) {
    return `${message.slice(0, TWITCH_CHAT_MESSAGE_LIMIT - 1)}…`
  }

  return `${message.slice(0, availableTextLength)}…${trailingLink}`
}

function makeDistinctTwitchChatMessage(message: string): string {
  if (message.length + DUPLICATE_DISAMBIGUATOR.length <= TWITCH_CHAT_MESSAGE_LIMIT) {
    return `${message}${DUPLICATE_DISAMBIGUATOR}`
  }

  return `${message.slice(0, TWITCH_CHAT_MESSAGE_LIMIT - DUPLICATE_DISAMBIGUATOR.length)}${DUPLICATE_DISAMBIGUATOR}`
}

// Test seam: clears the module-level dedupe cache so suites don't leak state.
export function clearDedupeCache(): void {
  messageDedupeCache.clear()
}

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamp] of messageDedupeCache.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      messageDedupeCache.delete(key)
    }
  }
}, 30_000) // Clean up every 30 seconds

function extractUserInfo(
  badges: {
    [key: string]: string
  }[],
  broadcasterUserId: string,
  chatterUserId: string
): {
  isMod: boolean
  isBroadcaster: boolean
  isSubscriber: boolean
  userId: string
} {
  return {
    isBroadcaster: broadcasterUserId === chatterUserId,
    isMod: badges.some(
      (badge) => badge.set_id === 'moderator' || badge.set_id === 'lead_moderator'
    ),
    isSubscriber: badges.some((badge) => badge.set_id === 'subscriber'),
    userId: chatterUserId,
  }
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
  data: {
    /** Unique ID of the sent message */
    message_id: string
    /** Whether message was successfully sent */
    is_sent: boolean
    /** Details if message was dropped */
    drop_reason?: ChatMessageDropReason
  }[]
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
  params: SendChatMessageParams
): Promise<TwitchChatMessageResponse> {
  const message = fitTwitchChatMessage(params.message)

  // Check if this broadcaster is currently being disabled to prevent race condition
  if (isBroadcasterBeingDisabled(params.broadcaster_id)) {
    logger.info('[DISABLE_CACHE] Skipping chat message for broadcaster being disabled', {
      broadcaster_id: params.broadcaster_id,
      message: params.message,
    })

    return {
      data: [
        {
          drop_reason: {
            code: 'user_being_disabled',
            message:
              'User is currently being disabled, skipping chat message to prevent race condition',
          },
          is_sent: false,
          message_id: '',
        },
      ],
    }
  }

  // Check for duplicate replies within the dedupe window. The parent message is the only proof
  // that two sends came from the same command event; unthreaded messages must not be collapsed
  // merely because their text matches.
  const dedupeKey = params.reply_parent_message_id
    ? `${params.broadcaster_id}:${params.reply_parent_message_id}:${params.message}`
    : undefined
  const now = Date.now()
  const lastSent = dedupeKey ? messageDedupeCache.get(dedupeKey) : undefined

  if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
    logger.info('[DEDUPE] Dropping duplicate chat message', {
      broadcaster_id: params.broadcaster_id,
      last_sent_ms_ago: now - lastSent,
      message: params.message,
    })

    return {
      data: [
        {
          drop_reason: {
            code: 'duplicate_message',
            message: `Duplicate message dropped (sent ${now - lastSent}ms ago): ${params.message}`,
          },
          is_sent: false,
          message_id: '',
        },
      ],
    }
  }

  // Record this message in the cache
  if (dedupeKey) {messageDedupeCache.set(dedupeKey, now)}

  const url = 'https://api.twitch.tv/helix/chat/messages'
  // Only the bot can send messages
  // Or a user with "user:bot" scope
  const headers = await getTwitchHeaders(params.sender_id)
  const options = {
    body: JSON.stringify({ ...params, message }),
    headers: { ...headers, 'Content-Type': 'application/json' },
    method: 'POST',
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
            drop_reason: {
              code: dropReasonCode,
              message: errorMessage,
            },
            is_sent: false,
            message_id: '',
          },
        ],
      }
    }

    const result = (await response.json()) as TwitchChatMessageResponse
    if (result.data?.[0]?.drop_reason?.code !== 'msg_duplicate') {
      return result
    }

    const distinctMessage = makeDistinctTwitchChatMessage(message)
    logger.info('[DEDUPE] Retrying Twitch duplicate response with disambiguated text', {
      broadcaster_id: params.broadcaster_id,
      message: params.message,
    })

    const retryResponse = await fetch(url, {
      ...options,
      body: JSON.stringify({ ...params, message: distinctMessage }),
    })
    if (!retryResponse.ok) {
      return {
        data: [
          {
            drop_reason: {
              code: retryResponse.status === 429 ? 'rate_limited' : 'send_error',
              message: `Failed to send disambiguated chat message: ${retryResponse.status} ${retryResponse.statusText}`,
            },
            is_sent: false,
            message_id: '',
          },
        ],
      }
    }

    return retryResponse.json() as Promise<TwitchChatMessageResponse>
  } catch (error) {
    // If it's not an HTTP error we already handled, log and return a formatted error
    logger.error('Error sending chat message', { broadcaster_id: params.broadcaster_id, error })

    return {
      data: [
        {
          drop_reason: {
            code: 'send_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          is_sent: false,
          message_id: '',
        },
      ],
    }
  }
}

interface ChatMessageNotification {
  payload: {
    subscription?: unknown
    event?: {
      chatter_user_login: string
      chatter_user_id: string
      message: { text: string }
      message_id: string
      broadcaster_user_id: string
      broadcaster_user_login: string
      badges: { [key: string]: string }[]
      reply?: { parent_message_id?: string } | null
      source_message_id: string | null
    }
  }
}

/**
 * Handles incoming chat messages from the EventSub WebSocket
 * @param message The WebSocket message payload
 */
export async function handleChatMessage(message: ChatMessageNotification): Promise<void> {
  if (!('subscription' in message.payload && 'event' in message.payload)) {
    return
  }

  const {event} = message.payload
  if (!event) {return}
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
      messageId: reply?.parent_message_id || message_id,
      userInfo,
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
  reply_parent_message_id?: string
): Promise<void> {
  const isBanned = await checkBotStatus()
  if (isBanned) {
    return
  }

  if (text === '!ping') {
    try {
      await sendTwitchChatMessage({
        broadcaster_id: channelId,
        message: t('rebooting', { emote: 'PauseChamp', lng: 'en' }),
        reply_parent_message_id,
        sender_id: process.env.TWITCH_BOT_PROVIDERID || '',
      })
    } catch (error) {
      logger.error('Could not send rebooting message', { error })
    }
  }
}
