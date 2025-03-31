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

if (!process.env.TWITCH_BOT_USERNAME) {
  logger.warn('TWITCH_BOT_USERNAME not set, using "dotabod" as default')
  process.env.TWITCH_BOT_USERNAME = 'dotabod'
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

// Bot status tracking
const botStatus = {
  isBanned: false,
  lastChecked: 0,
  banCheckCooldown: 60000, // Only check once per minute
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  requiredFailures: 2, // Require multiple consecutive failures before considering banned
  requiredSuccesses: 3, // Require multiple consecutive successes before considering unbanned
}

// Remember last error to prevent log spam
// biome-ignore lint/style/useConst: <explanation>
export let lastAuthErrorTime = 0
export const ERROR_LOG_COOLDOWN = 60000 // 1 minute

// Function to update lastAuthErrorTime
export function updateLastAuthErrorTime(time: number): void {
  lastAuthErrorTime = time
}

// Function to check if the bot is banned and update status
async function checkBotStatus() {
  // Skip check if we've checked recently
  if (Date.now() - botStatus.lastChecked < botStatus.banCheckCooldown) {
    return botStatus.isBanned
  }

  botStatus.lastChecked = Date.now()

  try {
    // Try to check the bot's validation status
    const authProvider = await getBotAuthProvider()
    const api = new ApiClient({ authProvider })

    // A simple API call that will fail if bot is banned/unauthorized
    await api.users.getUserByName(process.env.TWITCH_BOT_USERNAME || 'dotabod')

    // If we get here, bot is authorized
    botStatus.consecutiveSuccesses++
    botStatus.consecutiveFailures = 0

    // Only consider the bot unbanned after multiple successful checks
    if (botStatus.isBanned && botStatus.consecutiveSuccesses >= botStatus.requiredSuccesses) {
      logger.info('Bot authorization restored')
      botStatus.isBanned = false
    }
  } catch (error) {
    // Check if this is an auth error (401)
    const isAuthError =
      error instanceof Error &&
      (error.message.includes('401') || error.message.includes('Unauthorized'))

    if (isAuthError) {
      botStatus.consecutiveFailures++
      botStatus.consecutiveSuccesses = 0

      // Only consider the bot banned after multiple consecutive failures
      if (!botStatus.isBanned && botStatus.consecutiveFailures >= botStatus.requiredFailures) {
        logger.warn('Bot is currently banned or unauthorized')
        botStatus.isBanned = true
      }
    } else {
      // If not an auth error, log it but don't update ban status
      logger.error('Failed to check bot status', error)
    }
  }

  return botStatus.isBanned
}

// Simple function to check if the bot is currently banned
export function isBotBanned(): boolean {
  return botStatus.isBanned
}

// Set up periodic bot status check with different intervals based on ban status
const NORMAL_CHECK_INTERVAL = 10 * 60 * 1000 // 10 minutes when not banned
const BANNED_CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes when banned
let statusCheckInterval: NodeJS.Timeout

function setupStatusCheckInterval() {
  // Clear any existing interval
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }

  // Set interval based on current ban status
  const interval = botStatus.isBanned ? BANNED_CHECK_INTERVAL : NORMAL_CHECK_INTERVAL

  statusCheckInterval = setInterval(async () => {
    try {
      const wasBanned = botStatus.isBanned
      await checkBotStatus()

      // If ban status changed, update the check interval
      if (wasBanned !== botStatus.isBanned) {
        setupStatusCheckInterval()
      }

      if (!botStatus.isBanned) {
        logger.debug('Periodic check: Bot is operational')
      }
    } catch (error) {
      logger.error('Error in periodic bot status check', error)
    }
  }, interval)

  logger.debug(`Bot status check interval set to ${interval / 1000} seconds`)
}

// Initial setup of the status check interval
setupStatusCheckInterval()

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
        // Check if bot is banned before attempting to send message
        const isBanned = await checkBotStatus()
        if (isBanned) {
          // Don't attempt to send if bot is banned - just silently ignore to prevent log spam
          logger.debug('Not sending message - bot is currently banned', { providerAccountId })
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
          // Update bot status if we get an authorization error
          if (response.data?.[0]?.drop_reason?.code === 'bot_unauthorized') {
            // Increment failure count for more accurate detection
            botStatus.consecutiveFailures++
            botStatus.consecutiveSuccesses = 0

            if (botStatus.consecutiveFailures >= botStatus.requiredFailures) {
              botStatus.isBanned = true
              botStatus.lastChecked = Date.now()
              logger.warn('Bot detected as banned, disabling messages temporarily')
            }
            return
          }

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
        } else {
          // Message sent successfully - reset failure counter and update success counter
          botStatus.consecutiveFailures = 0
          botStatus.consecutiveSuccesses++
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
