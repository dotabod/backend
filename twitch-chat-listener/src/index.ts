import { lstatSync, readdirSync } from 'fs'
import { join } from 'path'

import { t, use } from 'i18next'
import FsBackend, { FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'

await use(FsBackend).init<FsBackendOptions>({
  initImmediate: false,
  lng: 'en',
  fallbackLng: 'en',
  preload: readdirSync(join('./locales')).filter((fileName: string) => {
    const joinedPath = join(join('./locales'), fileName)
    const isDirectory = lstatSync(joinedPath).isDirectory()
    return !!isDirectory
  }),
  defaultNS: 'translation',
  backend: {
    loadPath: join('./locales/{{lng}}/{{ns}}.json'),
  },
})

console.log('Loaded i18n for chat')

import './db/watcher.js'
import { getChatClient } from './twitch/lib/getChatClient.js'

// Setup twitch chatbot client FIRST
export const chatClient = await getChatClient()

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

  socket.on('say', async function (channel: string, text: string) {
    await chatClient.say(channel, text || "I'm sorry, I can't do that")
  })

  socket.on('join', async function (channel: string) {
    await chatClient.join(channel)
  })

  socket.on('part', function (channel: string) {
    chatClient.part(channel)
  })
})

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
