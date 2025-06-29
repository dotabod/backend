import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkBotStatus,
  getTwitchAPI,
  logger,
  supabase,
  trackDisableReason,
} from '@dotabod/shared-utils'
import { use } from 'i18next'
import FsBackend, { type FsBackendOptions } from 'i18next-fs-backend'
import { initializeSocket } from './conduitSetup.js'
import { sendTwitchChatMessage } from './handleChat.js'
import { io, setupSocketServer } from './utils/socketManager.js'

if (!process.env.TWITCH_BOT_PROVIDERID) {
  throw new Error('TWITCH_BOT_PROVIDERID not set')
}

if (!process.env.TWITCH_BOT_USERNAME) {
  logger.warn('TWITCH_BOT_USERNAME not set, using "dotabod" as default')
  process.env.TWITCH_BOT_USERNAME = 'dotabod'
}

async function startup() {
  try {
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

    // Initialize socket server
    setupSocketServer()

    // Initialize Twitch EventSub connection
    try {
      // chat v2
      await initializeSocket()
      logger.info('Twitch EventSub connection initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Twitch EventSub connection', error)

      // Try to reconnect after a delay
      setTimeout(() => {
        logger.info('Attempting to reconnect to Twitch EventSub...')
        initializeSocket().catch((e) => {
          logger.error('Reconnection to Twitch EventSub failed', e)
        })
      }, 30000) // Wait 30 seconds before retry
    }

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
  } catch (error) {
    logger.error('Error during startup', error)
    process.exit(1)
  }
}

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

  // Track the disable reason before disabling
  await trackDisableReason(user.userId, 'commandDisable', 'chat_permission_denied', {
    drop_reason: 'followers_only_mode',
    permission_required: 'moderator',
    additional_info: 'Bot is not a moderator and channel has followers-only mode enabled',
  })

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

// Start the service and handle any uncaught errors
startup().catch((error) => {
  logger.error('Fatal error during startup', error)
  process.exit(1)
})
