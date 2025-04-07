import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { initializeSocket } from './conduitSetup.js'
import { sendTwitchChatMessage } from './handleChat.js'
import supabase from './db/supabase.js'
import { checkBotStatus, logger, getTwitchAPI } from '@dotabod/shared-utils'
import { io, setupSocketServer } from './utils/socketManager.js'

if (!process.env.TWITCH_BOT_PROVIDERID) {
  throw new Error('TWITCH_BOT_PROVIDERID not set')
}

if (!process.env.TWITCH_BOT_USERNAME) {
  logger.warn('TWITCH_BOT_USERNAME not set, using "dotabod" as default')
  process.env.TWITCH_BOT_USERNAME = 'dotabod'
}

const isBanned = await checkBotStatus()
if (isBanned) {
  logger.error('Bot is banned!')
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

// Initialize socket server
setupSocketServer()

// Add event handlers for 'say' and 'whisper'
io.on('connection', (socket) => {
  socket.on(
    'say',
    async (providerAccountId: string, text: string, reply_parent_message_id?: string) => {
      try {
        // Check if bot is banned before attempting to send message
        const isBanned = await checkBotStatus()
        if (isBanned) {
          return
        }

        const response = await sendTwitchChatMessage({
          broadcaster_id: providerAccountId,
          sender_id: process.env.TWITCH_BOT_PROVIDERID!,
          reply_parent_message_id,
          message: text || "I'm sorry, I can't do that",
        })

        // Only disable if message failed to send
        if (!response.data?.[0]?.is_sent) {
          // Bot must not be a moderator
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

  socket.on('whisper', async (channel: string, text: string) => {
    try {
      const api = await getTwitchAPI()
      await api.whispers.sendWhisper(process.env.TWITCH_BOT_PROVIDERID!, channel, text)
    } catch (e) {
      logger.error('could not whisper', e)
    }
  })
})

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
