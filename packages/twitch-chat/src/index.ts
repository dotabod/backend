import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { ApiClient } from '@twurple/api'
import { t, use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'

import { initializeSocket } from './chatClientv2.js'
import supabase from './db/supabase.js'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider.js'

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

// chat v2
await initializeSocket()

const io = new Server(5005)

// Replace the let declaration with a Map to track connections
const connectedSockets = new Map<string, boolean>()

io.on('connection', (socket) => {
  console.log('Found a connection!')
  try {
    void socket.join('twitch-chat-messages')
    // Track this specific socket
    connectedSockets.set(socket.id, true)
  } catch (e) {
    console.log('Could not join twitch-chat-messages socket')
    return
  }

  socket.on('reconnect', () => {
    console.log('Reconnecting to the server')
    connectedSockets.set(socket.id, true)
  })

  socket.on('reconnect_failed', () => {
    console.log('Reconnect failed')
    connectedSockets.delete(socket.id)
  })

  socket.on('reconnect_error', (error) => {
    console.log('Reconnect error', error)
    connectedSockets.delete(socket.id)
  })

  socket.on('disconnect', (reason, details) => {
    console.log(
      'We lost the server! Respond to all messages with "server offline"',
      reason,
      details,
    )
    connectedSockets.delete(socket.id)
  })

  socket.on('say', async (channel: string, text: string) => {
    if (process.env.DOTABOD_ENV === 'development') console.log(channel, text)
    await chatClient.say(channel, text || "I'm sorry, I can't do that")
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

// chatClient.onJoinFailure((channel, reason) => {
//   if (['msg_banned', 'msg_banned_phone_number_alias', 'msg_channel_suspended'].includes(reason)) {
//     // disable the channel in the database
//     try {
//       void disableChannel(channel)
//     } catch (e) {
//       console.log('could not disable channel onJoinFailure', channel)
//     }
//     return
//   }

//   console.log('Failed to join channel', channel, reason)
// })

// Export a function to check if any sockets are connected
export function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

export { io }
