import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ApiClient } from '@twurple/api'
import { t, use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'

import supabase from './db/supabase.js'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider.js'
import { getChatClient } from './twitch/lib/getChatClient.js'

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

// Setup twitch chatbot client FIRST
export const chatClient = await getChatClient()

const io = new Server(5005)

let hasDotabodSocket = false
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

  hasDotabodSocket = true

  socket.on('disconnect', () => {
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })

  socket.on('say', async (channel: string, text: string) => {
    if (process.env.DOTABOD_ENV === 'development') console.log(channel, text)
    await chatClient.say(channel, text || "I'm sorry, I can't do that")
  })

  socket.on('join', (channel: string) => {
    try {
      chatClient.join(channel).catch((e) => {
        console.log('[ENABLE GSI] Failed to enable client inside promise', { channel, error: e })
      })
    } catch (e) {
      console.log('[ENABLE GSI] Failed to enable client', { channel, error: e })
    }
  })

  socket.on('whisper', async (channel: string, text: string) => {
    try {
      if (!process.env.TWITCH_BOT_PROVIDERID) throw new Error('TWITCH_BOT_PROVIDERID not set')

      const authProvider = await getBotAuthProvider()
      const api = new ApiClient({ authProvider })
      await api.whispers.sendWhisper(process.env.TWITCH_BOT_PROVIDERID, channel, text)
    } catch (e) {
      console.error('could not whisper', e)
    }
  })

  socket.on('part', (channel: string) => {
    chatClient.part(channel)
  })
})

async function disableChannel(channel: string) {
  const name = channel.replace('#', '')
  const { data: user } = await supabase
    .from('users')
    .select(
      `
    id,
    settings (
      key,
      value
    )
    `,
    )
    .eq('name', name)
    .single()

  if (!user) {
    console.log('Failed to find user', name)
    return
  }

  if (user.settings.find((s) => s.key === 'commandDisable' && s.value === true)) {
    console.log('User already disabled', name)
    return
  }

  console.log('Disabling user', name)
  await supabase.from('settings').upsert(
    {
      userId: user.id,
      key: 'commandDisable',
      value: true,
    },
    {
      onConflict: 'userId, key',
    },
  )
}

chatClient.onJoinFailure((channel, reason) => {
  if (['msg_banned', 'msg_banned_phone_number_alias', 'msg_channel_suspended'].includes(reason)) {
    // disable the channel in the database
    try {
      void disableChannel(channel)
    } catch (e) {
      console.log('could not disable channel onJoinFailure', channel)
    }
    return
  }

  console.log('Failed to join channel', channel, reason)
})

chatClient.onMessage((channel, user, text, msg) => {
  if (!hasDotabodSocket) {
    // TODO: only commands that we register should be checked here
    if (text === '!ping') {
      try {
        void chatClient.say(channel, t('rebooting', { emote: 'PauseChamp', lng: 'en' }))
      } catch (e) {
        console.log('could not type rebooting msg', e)
      }
    }

    return
  }

  const { channelId, userInfo, id: messageId } = msg
  const { isMod, isBroadcaster, isSubscriber, userId } = userInfo

  // forward the msg to dota node app
  io.to('twitch-chat-messages').emit('msg', channel, user, text, {
    channelId,
    userInfo: { isMod, isBroadcaster, isSubscriber, userId },
    messageId,
  })
})

export default io
