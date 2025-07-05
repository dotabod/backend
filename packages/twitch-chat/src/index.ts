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

// Temporary cache to prevent duplicate disableUser calls during race condition
const disableUserCache = new Map<
  string,
  { timestamp: number; dropReason: string; providerAccountId: string }
>()
const DISABLE_CACHE_EXPIRY = 30000 // 30 seconds

/**
 * Clear disable cache for a user (called when they manually re-enable)
 */
export function clearDisableCache(userId: string) {
  const keysToDelete: string[] = []
  for (const key of disableUserCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key)
    }
  }

  for (const key of keysToDelete) {
    disableUserCache.delete(key)
  }

  if (keysToDelete.length > 0) {
    logger.info('[DISABLE_CACHE] Cleared cache for user', {
      userId,
      clearedKeys: keysToDelete.length,
    })
  }
}

/**
 * Check if a user is currently in the disable cache (being disabled)
 */
export function isUserBeingDisabled(userId: string): boolean {
  const now = Date.now()

  for (const [key, value] of disableUserCache.entries()) {
    if (key.startsWith(`${userId}:`) && now - value.timestamp < DISABLE_CACHE_EXPIRY) {
      return true
    }
  }

  return false
}

/**
 * Check if a broadcaster is currently being disabled (by providerAccountId)
 */
export function isBroadcasterBeingDisabled(providerAccountId: string): boolean {
  const now = Date.now()

  for (const [key, value] of disableUserCache.entries()) {
    if (
      value.providerAccountId === providerAccountId &&
      now - value.timestamp < DISABLE_CACHE_EXPIRY
    ) {
      return true
    }
  }

  return false
}

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

    // Listen for disable cache clear events from other packages
    io.on('clear-disable-cache', ({ userId }: { userId: string }) => {
      clearDisableCache(userId)
    })

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
              const dropReason = response.data?.[0]?.drop_reason

              // Handle different drop reason codes that require disabling
              if (dropReason?.code === 'followers_only_mode') {
                await disableUser(providerAccountId, dropReason)
              } else if (dropReason?.code === 'user_warned') {
                await disableUser(providerAccountId, dropReason)
              } else if (dropReason?.code === 'banned_phone_alias') {
                // Bot's phone number is banned from the channel - this should disable the bot
                await disableUser(providerAccountId, dropReason)
              } else if (dropReason?.code === 'rate_limited') {
                // Don't disable for rate limiting - just log it
                logger.warn('Chat message rate limited, not disabling account:', {
                  message: text,
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                })
              } else if (dropReason?.code === 'send_error') {
                // Don't disable for generic send errors - just log them
                logger.error('Chat message send error, not disabling account:', {
                  message: text,
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                })
              } else if (dropReason?.code === 'msg_rejected') {
                // Don't disable for message moderation - bot can still send other messages
                logger.warn('Chat message rejected by moderators, not disabling account:', {
                  message: text,
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                })
              } else if (dropReason?.code === 'duplicate_message') {
                // Don't disable for duplicate messages - can retry later
                logger.warn('Chat message dropped as duplicate, not disabling account:', {
                  message: text,
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                })
              } else if (dropReason?.code === 'msg_duplicate') {
                // Don't disable for Twitch's 30-second duplicate restriction
                logger.warn(
                  'Chat message blocked by Twitch duplicate restriction, not disabling account:',
                  {
                    message: text,
                    broadcaster_id: providerAccountId,
                    drop_reason: dropReason,
                  },
                )
              } else if (dropReason?.code) {
                // Only disable for actual permission issues
                await disableUser(providerAccountId, dropReason)
              } else {
                // Log the entire message and response for unknown issues
                logger.error('Failed to send chat message in drop reason:', {
                  message: text,
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
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

async function disableUser(
  providerAccountId: string,
  dropReason?: { code: string; message: string },
) {
  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', providerAccountId)
    .single()

  if (!user?.userId) {
    logger.error('Failed to send chat message: no user found', providerAccountId)
    return
  }

  // Check if we've already disabled this user recently to prevent duplicate calls
  const cacheKey = `${user.userId}:${dropReason?.code || 'unknown'}`
  const cached = disableUserCache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.timestamp < DISABLE_CACHE_EXPIRY) {
    logger.info('[DISABLE_CACHE] Skipping duplicate disable call', {
      userId: user.userId,
      providerAccountId,
      dropReason: dropReason?.code,
      cachedAt: new Date(cached.timestamp).toISOString(),
    })
    return
  }

  // Add to cache to prevent duplicates
  disableUserCache.set(cacheKey, {
    timestamp: now,
    dropReason: dropReason?.code || 'unknown',
    providerAccountId,
  })

  // Clean up expired cache entries
  for (const [key, value] of disableUserCache.entries()) {
    if (now - value.timestamp >= DISABLE_CACHE_EXPIRY) {
      disableUserCache.delete(key)
    }
  }

  // Create metadata based on the drop reason
  let metadata: any = {
    drop_reason: dropReason?.code || 'unknown',
    drop_reason_message: dropReason?.message || 'Unknown chat permission issue',
  }

  // Add specific details based on drop reason code
  switch (dropReason?.code) {
    case 'followers_only_mode':
      metadata = {
        ...metadata,
        permission_required: 'moderator',
        additional_info: 'Bot is not a moderator and channel has followers-only mode enabled',
      }
      break
    case 'user_warned':
      metadata = {
        ...metadata,
        warning_status: 'active',
        additional_info:
          'Bot account is currently warned and cannot send messages until warning is acknowledged',
      }
      break
    default:
      metadata = {
        ...metadata,
        additional_info: `Chat message blocked due to: ${dropReason?.message || 'Unknown reason'}`,
      }
      break
  }

  // Track the disable reason before disabling
  await trackDisableReason(user.userId, 'commandDisable', 'CHAT_PERMISSION_DENIED', metadata)

  // Disable the user in database
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

  logger.error('Failed to send chat message. Disabled user', {
    providerAccountId,
    dropReason: dropReason?.code,
    dropReasonMessage: dropReason?.message,
  })
}

// Start the service and handle any uncaught errors
startup().catch((error) => {
  logger.error('Fatal error during startup', error)
  process.exit(1)
})
