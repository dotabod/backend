import { Server } from 'socket.io'

import './db/watcher.js'
import { getChatClient } from './twitch/lib/getChatClient.js'

const io = new Server()

let hasDotabodSocket = false
io.on('connection', (socket) => {
  // dota node app just connected
  // make it join our room
  void socket.join('twitch-chat-messages')
  hasDotabodSocket = true

  socket.on('disconnect', () => {
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })
})

io.listen(5005)

// Setup twitch chat bot client
export const chatClient = await getChatClient()

chatClient.onMessage(function (channel, user, text, msg) {
  if (!hasDotabodSocket) {
    if (text.startsWith('!')) {
      void chatClient.say(channel, 'Dotabod offline PauseChamp must be rebooting...Hang tight')
    }

    return
  }

  // forward the msg to dota node app
  io.to('twitch-chat-messages').emit(channel, user, text, msg)
})

export default io
