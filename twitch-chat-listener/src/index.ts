import { Server } from 'socket.io'

import './db/watcher.js'
import { getChatClient } from './twitch/lib/getChatClient.js'

const io = new Server(5005)

let hasDotabodSocket = false
io.on('connection', (socket) => {
  // dota node app just connected
  // make it join our room
  console.log('Found a connection!')
  void socket.join('twitch-chat-messages')
  hasDotabodSocket = true

  socket.on('disconnect', () => {
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })
})

io.on('say', function (channel: string, text: string) {
  void chatClient.say(channel, text)
})

// Setup twitch chat bot client
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!hasDotabodSocket) {
    // TODO: only commands that we register should be checked here
    if (text.startsWith('!') && text.length > 1) {
      void chatClient.say(channel, 'Servers are rebooting...Try again soon PauseChamp')
    }

    return
  }

  const { channelId, userInfo, id: messageId } = msg
  const { isMod, isBroadcaster, isSubscriber } = userInfo

  // forward the msg to dota node app
  io.to('twitch-chat-messages').emit('msg', channel, user, text, {
    channelId,
    userInfo: { isMod, isBroadcaster, isSubscriber },
    messageId,
  })
})

export default io
