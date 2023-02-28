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
    return lstatSync(joinedPath).isDirectory()
  }),
  defaultNS: 'translation',
  backend: {
    loadPath: join('./locales/{{lng}}/{{ns}}.json'),
  },
})

console.log('Loaded i18n for chat')

import './db/watcher.js'
import { prisma } from './db/prisma.js'
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

  socket.on('join', function (channel: string) {
    try {
      chatClient
        .join(channel)
        .then(() => {
          //
        })
        .catch((e) => {
          console.log('[ENABLE GSI] Failed to enable client inside promise', { channel, error: e })
        })
    } catch (e) {
      console.log('[ENABLE GSI] Failed to enable client', { channel, error: e })
    }
  })

  socket.on('part', function (channel: string) {
    chatClient.part(channel)
  })
})

async function disableChannel(channel: string) {
  const name = channel.replace('#', '')
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      settings: {
        select: {
          key: true,
          value: true,
        },
      },
    },
    where: { name },
  })

  if (!user) {
    console.log('Failed to find user', name)
    return
  }

  if (user.settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    console.log('User already disabled', name)
    return
  }

  console.log('Disabling user', name)
  await prisma.setting.upsert({
    where: {
      key_userId: {
        userId: user.id,
        key: 'commandDisable',
      },
    },
    create: {
      userId: user.id,
      key: 'commandDisable',
      value: true,
    },
    update: {
      value: true,
    },
  })
}

chatClient.onJoinFailure((channel, reason) => {
  if (['msg_banned', 'msg_banned_phone_number_alias', 'msg_channel_suspended'].includes(reason)) {
    // disable the channel in the database
    void disableChannel(channel)
    return
  }

  console.log('Failed to join channel', channel, reason)
})

chatClient.onMessage(function (channel, user, text, msg) {
  if (!hasDotabodSocket) {
    // TODO: only commands that we register should be checked here
    if (text === '!ping') {
      void chatClient.say(channel, t('rebooting', { emote: 'PauseChamp', lng: 'en' }))
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
