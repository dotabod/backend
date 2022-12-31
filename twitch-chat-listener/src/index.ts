import { t, use } from 'i18next'
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'

await use(FsBackend).init<FsBackendOptions>({
  initImmediate: false,
  lng: 'en',
  fallbackLng: 'en',
  preload: ['en', 'ru', 'it', 'es', 'pt-BR'],
  defaultNS: 'translation',
  backend: {
    loadPath: 'locales/{{lng}}/{{ns}}.json',
  },
})

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
    if (text === '!ping') {
      void chatClient.say(channel, t('rebooting', { lng: 'en' }))
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
