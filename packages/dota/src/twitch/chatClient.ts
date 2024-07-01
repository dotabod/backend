import { io } from 'socket.io-client'

import { getAppToken } from '@twurple/auth'
import { findUserByName } from '../dota/lib/connectedStreamers'
import { isDev } from '../dota/lib/consts.js'
import { eventsubSocket } from './eventSubSocket'

// Our docker chat forwarder instance
export const twitchChat = io(`ws://${process.env.HOST_TWITCH_CHAT}:5005`)
const prefix = isDev ? '[DEV] ' : ''

const appToken = await getAppToken(process.env.TWITCH_CLIENT_ID!, process.env.TWITCH_CLIENT_SECRET!)

const twitchHeaders = {
  'Client-Id': process.env.TWITCH_CLIENT_ID!,
  Authorization: `Bearer ${appToken?.accessToken}`,
  Accept: 'application/json',
  'Accept-Encoding': 'gzip',
}

const conduitsReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
  method: 'GET',
  headers: twitchHeaders,
})
const { data } = await conduitsReq.json()
const conduitId = data[0]?.id || (await createConduit())
console.log({ conduitId })

async function createConduit() {
  console.log('Creating conduit')
  const createReq = await fetch('https://api.twitch.tv/helix/eventsub/conduits', {
    method: 'POST',
    headers: {
      ...twitchHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ shard_count: 1 }),
  })
  const { data } = await createReq.json()
  const { id } = data[0]
  return id
}

function getShards() {
  return fetch(`https://api.twitch.tv/helix/eventsub/conduits/shards?conduit_id=${conduitId}`, {
    method: 'GET',
    headers: {
      ...twitchHeaders,
    },
  })
}

// The Conduit exists
// lets spawn a WebSocket and assign this socket to a shard
// if we are a ID of auto then the shard ID is forced to 0 if we created...
const mySocket = new eventsubSocket({})
mySocket.on('connected', async (session_id) => {
  console.log(`Socket has connected ${session_id} for ${conduitId}`)

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
  // connect the socket to the conduit on the stated shard ID
  const conduitUpdate = await fetch('https://api.twitch.tv/helix/eventsub/conduits/shards', {
    method: 'PATCH',
    headers: {
      ...twitchHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (conduitUpdate.status != 202) {
    console.error(await conduitUpdate.text(), 'Failed to assign socket to shard')
    // console.error(
    // `Failed to assign socket to shard ${conduitUpdate.status}//${await conduitUpdate.text()}`,
    // );
    return
  } else {
    console.log('Socket assigned to shard')
  }
  // check for errors
  const { data, errors } = await conduitUpdate.json()
  if (errors && errors.length > 0) {
    console.error(`Failed to udpate the shard`)
    console.error(errors)
  } else {
    console.log('Shard Updated')
  }
})

mySocket.on('error', (error) => {
  console.error('Socket Error', error)
})

mySocket.on('notification', (message) => {
  console.log('Socket Message', message)
})

export const chatClient = {
  join: (channel: string) => {
    twitchChat.emit('join', channel)
  },
  part: (channel: string) => {
    twitchChat.emit('part', channel)
  },
  say: (channel: string, text: string) => {
    if (isDev) console.log({ channel, text })
    const user = findUserByName(channel.toLowerCase().replace('#', ''))
    const hasNewestScopes = user?.Account?.scope?.includes('channel:bot')
    if (hasNewestScopes) {
      const newPrefix = prefix ? `${prefix}[NEW-API]` : prefix
      void fetch('https://api.twitch.tv/helix/chat/messages', {
        method: 'POST',
        headers: twitchHeaders,
        body: JSON.stringify({
          broadcaster_id: user?.Account?.providerAccountId,
          sender_id: process.env.TWITCH_BOT_PROVIDERID,
          message: `${newPrefix}${text}`,
        }),
      })
      return
    }

    twitchChat.emit('say', channel, `${prefix}${text}`)
  },
  whisper: (channel: string, text: string) => {
    twitchChat.emit('whisper', channel, `${prefix}${text}`)
  },
}
