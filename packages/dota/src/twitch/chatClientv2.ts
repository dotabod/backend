import { getAppToken } from '@twurple/auth'
import type { EventSubChannelChatMessageEventData } from '@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.external'
import type { EventSubWsPacket } from '@twurple/eventsub-ws/lib/EventSubWsPacket.external'
import { logger } from '../utils/logger'
import { EventsubSocket } from './eventSubSocket'

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

// TODO: Move this to twitch-events package
const subscribeToUserUpdate = async (conduit_id: string, broadcaster_user_id: string) => {
  const body = {
    type: 'channel.chat.message',
    version: '1',
    condition: {
      user_id: '843245458', // bot dotabod
      broadcaster_user_id: '32474777', // TL
    },
    transport: {
      method: 'conduit',
      conduit_id,
    },
  }
  const subscribeReq = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (subscribeReq.status !== 202) {
    console.error(
      `Failed to subscribe to channel.chat.message ${
        subscribeReq.status
      } ${await subscribeReq.text()}`,
    )
    return
  }
  console.log('Subscribed to channel.chat.message')
}

// TODO: Move this to twitch-chat package
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

  mySocket.on('notification', (message: EventSubWsPacket) => {
    if (
      'subscription' in message.payload &&
      'event' in message.payload &&
      message.payload.subscription.type === 'channel.chat.message'
    ) {
      const {
        chatter_user_login,
        message: { text },
      } = message.payload.event as unknown as EventSubChannelChatMessageEventData
      logger.info('Socket Message', { chatter_user_login, text })
    }
    logger.info('Socket Message', { message: message.payload })
  })
}

initializeSocket()
