import 'newrelic'

import { Server } from 'socket.io'

import TwitchChatClient from './TwitchChatClient.js'

const twitchClient = new TwitchChatClient()
await twitchClient.connect()

const io = new Server(5005)

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

  socket.on('disconnect', () => {
    console.log('We lost the server! Respond to all messages with "server offline"')
  })

  socket.on('say', async function (channel: string, text: string) {
    if (process.env.NODE_ENV === 'development') console.log(channel, text)
    await twitchClient.say(channel, text || "I'm sorry, I can't do that")
  })

  socket.on('join', async function (channel: string) {
    try {
      await twitchClient.join(channel)
    } catch (e) {
      console.log('[ENABLE GSI] Failed to enable client', { channel, error: e })
    }
  })

  socket.on('part', function (channel: string) {
    twitchClient.part(channel)
  })
})

export interface MessageCallback {
  channel: string
  user: string
  text: string
  channelId: string | null
  userInfo: {
    isMod: boolean
    isBroadcaster: boolean
    isSubscriber: boolean
  }
  messageId: string
}

const defaultCallback = ({
  channel,
  user,
  text,
  channelId,
  userInfo: { isMod, isBroadcaster, isSubscriber },
  messageId,
}: MessageCallback) => {
  io.to('twitch-chat-messages').emit('msg', channel, user, text, {
    channelId,
    userInfo: { isMod, isBroadcaster, isSubscriber },
    messageId,
  })
}

export default io
