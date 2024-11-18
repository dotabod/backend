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

  socket.on('reconnect', () => {
    console.log('Reconnecting to the server')
    hasDotabodSocket = true
  })

  socket.on('reconnect_failed', () => {
    console.log('Reconnect failed')
    hasDotabodSocket = false
  })

  socket.on('reconnect_error', (error) => {
    console.log('Reconnect error', error)
    hasDotabodSocket = false
  })

  socket.on('disconnect', (reason, details) => {
    console.log(
      'We lost the server! Respond to all messages with "server offline"',
      reason,
      details,
    )
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

export { hasDotabodSocket, io }
