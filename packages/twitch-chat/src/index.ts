import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ApiClient } from '@twurple/api'
import { use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { Server } from 'socket.io'
import { initializeSocket } from './conduitSetup.js'
import { sendTwitchChatMessage } from './handleChat.js'
import { logger } from './logger.js'
import { getBotAuthProvider } from './twitch/lib/getBotAuthProvider.js'
import supabase from './db/supabase.js'

if (!process.env.TWITCH_BOT_PROVIDERID) {
  throw new Error('TWITCH_BOT_PROVIDERID not set')
}

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

logger.info('Loaded i18n for chat')

// chat v2
await initializeSocket()

const io = new Server(5005)

// Replace the let declaration with a Map to track connections
const connectedSockets = new Map<string, boolean>()

io.on('connection', (socket) => {
  logger.info('Found a connection!')
  try {
    void socket.join('twitch-chat-messages')
    // Track this specific socket
    connectedSockets.set(socket.id, true)
  } catch (e) {
    logger.info('Could not join twitch-chat-messages socket')
    return
  }

  socket.on('reconnect', () => {
    logger.info('Reconnecting to the server')
    connectedSockets.set(socket.id, true)
  })

  socket.on('reconnect_failed', () => {
    logger.info('Reconnect failed')
    connectedSockets.delete(socket.id)
  })

  socket.on('reconnect_error', (error) => {
    logger.info('Reconnect error', error)
    connectedSockets.delete(socket.id)
  })

  socket.on('disconnect', (reason, details) => {
    logger.info(
      'We lost the server! Respond to all messages with "server offline"',
      reason,
      details,
    )
    connectedSockets.delete(socket.id)
  })

  socket.on(
    'say',
    async (providerAccountId: string, text: string, reply_parent_message_id?: string) => {
      try {
        const response = await sendTwitchChatMessage({
          broadcaster_id: providerAccountId,
          sender_id: process.env.TWITCH_BOT_PROVIDERID!,
          reply_parent_message_id,
          message: text || "I'm sorry, I can't do that",
        })

        // Only disable if message failed to send
        if (!response.data?.[0]?.is_sent) {
          if (response.data?.[0]?.drop_reason?.code === 'followers_only_mode') {
            await disableUser(providerAccountId)
          } else {
            // Log the entire message and response
            logger.error('Failed to send chat message in drop reason:', {
              message: text,
              broadcaster_id: providerAccountId,
              drop_reason: response.data?.[0]?.drop_reason,
              response,
            })
          }
        }
      } catch (e) {
        logger.error('Failed to send chat message in say', e)
      }
    },
  )

  async function disableUser(providerAccountId: string) {
    const { data: user } = await supabase
      .from('accounts')
      .select('userId')
      .eq('providerAccountId', providerAccountId)
      .single()

    if (!user?.userId) {
      logger.error('Failed to send chat message: no user found', providerAccountId)
      return
    }

    // Disable the user
    await supabase.from('settings').upsert(
      {
        userId: user.userId,
        key: 'commandDisable',
        value: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'userId, key',
      },
    )

    logger.error('Failed to send chat message. Disabled user', providerAccountId)
  }

  socket.on('whisper', async (channel: string, text: string) => {
    try {
      const authProvider = await getBotAuthProvider()
      const api = new ApiClient({ authProvider })
      await api.whispers.sendWhisper(process.env.TWITCH_BOT_PROVIDERID!, channel, text)
    } catch (e) {
      logger.error('could not whisper', e)
    }
  })
})

// Export a function to check if any sockets are connected
export function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

export { io }
