import { getAppToken } from '@twurple/auth'
import type { EventSubChannelChatMessageEventData } from '@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.external'
import type { EventSubChatBadge } from '@twurple/eventsub-base/lib/events/common/EventSubChatMessage.external'
import type { EventSubWsPacket } from '@twurple/eventsub-ws/lib/EventSubWsPacket.external'
import { t } from 'i18next'
import { EventsubSocket } from './eventSubSocket.js'
import { hasDotabodSocket, io } from './index.js'
import { logger } from './logger.js'

// Constants
const headers = await getTwitchHeaders()

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

// Function to fetch conduit ID
async function fetchConduitId(): Promise<string> {
  const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'GET',
    headers,
  })

  const { data } = await conduitsReq.json()
  logger.info('Conduit ID', { data })
  return data[0]?.id || createConduit()
}

// Function to create a new conduit
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

  const { data } = await createReq.json()
  return data[0].id
}

// Function to update conduit shard
async function updateConduitShard(session_id: string, conduitId: string) {
  const body = {
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
  const { errors } = await conduitUpdate.json()
  if (errors && errors.length > 0) {
    logger.error('Failed to update the shard', { errors })
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

  mySocket.on('notification', handleNotification)
  mySocket.on('revocation', handleRevocation)
}

async function handleNotification(message: EventSubWsPacket) {
  if (
    'subscription' in message.payload &&
    'event' in message.payload &&
    message.payload.subscription.type === 'channel.chat.message'
  ) {
    const {
      chatter_user_login,
      chatter_user_id,
      message: { text },
      message_id,
      broadcaster_user_id: channelId,
      badges,
      broadcaster_user_login,
    } = message.payload.event as unknown as EventSubChannelChatMessageEventData

    const userInfo = extractUserInfo(badges, channelId, chatter_user_id)

    if (!hasDotabodSocket()) {
      // TODO: only commands that we register should be checked here
      if (text === '!ping') {
        try {
          void fetch('https://api.twitch.tv/helix/chat/messages', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              broadcaster_id: channelId,
              sender_id: process.env.TWITCH_BOT_PROVIDERID,
              message: t('rebooting', { emote: 'PauseChamp', lng: 'en' }),
            }),
          })
        } catch (e) {
          logger.error('Could not send rebooting message', { e })
        }
      }
      return
    }

    io.to('twitch-chat-messages').emit('msg', broadcaster_user_login, chatter_user_login, text, {
      channelId,
      userInfo,
      messageId: message_id,
    })
  }
}

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

export { initializeSocket }
