import 'newrelic'

import { Server } from 'socket.io'

import KickChatClient from './KickChatClient.js'
import TwitchChatClient from './TwitchChatClient.js'

const io = new Server(5005)

export interface MessageCallback {
  channel: string
  user: string
  text: string
  provider: 'kick' | 'twitch'
  channelId: string | null
  userInfo: {
    isMod: boolean
    isBroadcaster: boolean
    isSubscriber: boolean
  }
  messageId: string
}

// Default message callback
const emitChatMessage = (message: MessageCallback) => {
  const { channel, user, text, channelId, userInfo, messageId } = message
  io.to('twitch-chat-messages').emit('msg', channel, user, text, { channelId, userInfo, messageId })
}

// Twitch Client Setup
const twitchClient = new TwitchChatClient()
await twitchClient.connect()
twitchClient.onMessage(emitChatMessage)

// Kick Client Setup
const kickClient = new KickChatClient()
await kickClient.connect()
kickClient.onMessage(emitChatMessage)

io.on('connection', (socket) => {
  // dota node app just connected
  // make it join our room
  console.log('Found a connection!')
  try {
    void socket.join('twitch-chat-messages')
  } catch (e) {
    console.log('Could not join twitch-chat-messages socket')
    return
  }

  socket.on('disconnect', () => console.log('Chat server disconnected'))

  socket.on('say', async (channel: string, text: string = "I'm sorry, I can't do that") => {
    if (process.env.NODE_ENV === 'development') {
      console.log(channel, text)
    }

    try {
      const client = kickClient.isKickChannel(channel) ? kickClient : twitchClient
      await client.say(channel.replace(/^(#?kick:)/, ''), text)
    } catch (e) {
      console.log('[CHAT] Failed to send message', { channel, text, error: e })
    }
  })

  socket.on('join', async function (channel: string) {
    try {
      const client = kickClient.isKickChannel(channel) ? kickClient : twitchClient
      await client.join(channel.replace(/^(#?kick:)/, ''))
    } catch (e) {
      console.log('[ENABLE GSI] Failed to enable client', { channel, error: e })
    }
  })

  socket.on('part', async function (channel: string) {
    const client = kickClient.isKickChannel(channel) ? kickClient : twitchClient
    await client.part(channel.replace(/^(#?kick:)/, ''))
  })
})

export default io
