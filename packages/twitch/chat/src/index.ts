import 'newrelic'

import { Server } from 'socket.io'

import KickChatClient from './KickChatClient.js'
import TwitchChatClient from './TwitchChatClient.js'
import YoutubeChatClient from './YoutubeChatClient.js'

const io = new Server(5005)

export interface MessageCallback {
  channel: string
  user: string
  text: string
  provider: 'kick' | 'twitch' | 'youtube'
  channelId: string | null
  userInfo: {
    isMod: boolean
    isBroadcaster: boolean
    isSubscriber: boolean
  }
  messageId: string
}

// Default message callback
export const emitChatMessage = (message: MessageCallback) => {
  const { channel, user, text, channelId, userInfo, messageId } = message
  io.to('twitch-chat-messages').emit('msg', channel, user, text, { channelId, userInfo, messageId })
}

const determineChatClient = (channel: string) => {
  const cleanedChannel = channel
  const client: TwitchChatClient | KickChatClient = twitchClient

  // if (channel.includes('kick:')) {
  //   cleanedChannel = channel.replace(/^(#?kick:)/, '')
  //   client = kickClient
  // }

  return { client, cleanedChannel }
}

// Twitch Client Setup
const twitchClient = new TwitchChatClient()
await twitchClient.connect()
twitchClient.onMessage(emitChatMessage)

// Kick Client Setup
// const kickClient = new KickChatClient()
// await kickClient.connect()
// kickClient.onMessage(emitChatMessage)

// Youtube Client Setup
const youtubeClient = new YoutubeChatClient()
await youtubeClient.connect()
await youtubeClient.onMessage(emitChatMessage)

io.on('connection', (socket) => {
  console.log('[CHAT] Found a connection!')

  try {
    void socket.join('twitch-chat-messages')
  } catch (e) {
    console.log('[CHAT] Could not join twitch-chat-messages socket')
    return
  }

  socket.on('disconnect', () => console.log('Chat server disconnected'))

  socket.on('say', async (channel: string, text: string = "I'm sorry, I can't do that") => {
    if (process.env.NODE_ENV === 'development') {
      console.log(channel, text)
    }

    try {
      const { client, cleanedChannel } = determineChatClient(channel)
      await client.say(cleanedChannel, text)
    } catch (e) {
      console.log('[CHAT] Failed to send message', { channel, text, error: e })
    }
  })

  socket.on('join', async function (channel: string) {
    try {
      const { client, cleanedChannel } = determineChatClient(channel)
      await client.join(cleanedChannel)
    } catch (e) {
      console.log('[ENABLE GSI] Failed to enable client', { channel, error: e })
    }
  })

  socket.on('part', function (channel: string) {
    const { client, cleanedChannel } = determineChatClient(channel)
    client.part(cleanedChannel)
  })
})

export default io
