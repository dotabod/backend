process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  checkBotStatus,
  checkSupabaseHealth,
  commandDisable,
  getTwitchAPI,
  logger,
  startHeartbeat,
  supabase,
} from '@dotabod/shared-utils'
import type { DisableReasonMetadata } from '@dotabod/shared-utils'
import { use } from 'i18next'
import FsBackend from 'i18next-fs-backend'
import type { FsBackendOptions } from 'i18next-fs-backend'

import { ensureEventSubInitialized } from './conduitSetup'
import { clearDisableCache, DISABLE_CACHE_EXPIRY, disableUserCache } from './disableCache'
import { isEventsubConnected } from './eventSubSocket'
import { sendTwitchChatMessage } from './handleChat'
import { io, setupSocketServer } from './utils/socketManager'

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
      backend: {
        loadPath: join('./locales/{{lng}}/{{ns}}.json'),
      },
      defaultNS: 'translation',
      fallbackLng: 'en',
      initAsync: false,
      lng: 'en',
      preload: readdirSync(join('./locales')).filter((fileName: string) => {
        const joinedPath = join(join('./locales'), fileName)
        return lstatSync(joinedPath).isDirectory()
      }),
    })

    logger.info('Loaded i18n for chat')

    // Initialize socket server
    setupSocketServer()

    // Report liveness to the Uptime Kuma push monitor
    startHeartbeat()

    // Report whether the bot's Twitch EventSub connection is live (separate monitor)
    startHeartbeat({
      debounceMs: 90_000,
      getStatus: () => ({
        msg: isEventsubConnected() ? 'connected' : 'eventsub disconnected',
        up: isEventsubConnected(),
      }),
      name: 'eventsub heartbeat',
      url: process.env.KUMA_PUSH_URL_EVENTSUB,
    })

    // Dependency-aware Supabase probe: the liveness ping above stays green even
    // when the container can't reach Supabase, so every account/token lookup
    // can fail silently (as it did in the 2026-05-29 network incident).
    startHeartbeat({
      debounceMs: 90_000,
      getStatus: checkSupabaseHealth,
      name: 'twitch-chat supabase heartbeat',
      url: process.env.KUMA_PUSH_URL_SUPABASE,
    })

    // Initialize Twitch EventSub connection. If twitch-events isn't reachable
    // yet, this attempt fails — but the eventsSocket 'connect' handler in
    // conduitSetup re-runs it whenever the link to twitch-events comes (back) up,
    // so EventSub self-heals instead of staying dead until a manual restart.
    await ensureEventSubInitialized('startup')

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
              message: text || "I'm sorry, I can't do that",
              reply_parent_message_id,
              sender_id: process.env.TWITCH_BOT_PROVIDERID!,
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
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                  message: text,
                })
              } else if (dropReason?.code === 'send_error') {
                // Don't disable for generic send errors - just log them
                logger.error('Chat message send error, not disabling account:', {
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                  message: text,
                })
              } else if (dropReason?.code === 'msg_rejected') {
                // Don't disable for message moderation - bot can still send other messages
                logger.warn('Chat message rejected by moderators, not disabling account:', {
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                  message: text,
                })
              } else if (dropReason?.code === 'duplicate_message') {
                // Don't disable for duplicate messages - can retry later
                logger.warn('Chat message dropped as duplicate, not disabling account:', {
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                  message: text,
                })
              } else if (dropReason?.code === 'msg_duplicate') {
                // Don't disable for Twitch's 30-second duplicate restriction
                logger.warn(
                  'Chat message blocked by Twitch duplicate restriction, not disabling account:',
                  {
                    broadcaster_id: providerAccountId,
                    drop_reason: dropReason,
                    message: text,
                  }
                )
              } else if (dropReason?.code) {
                // Only disable for actual permission issues
                await disableUser(providerAccountId, dropReason)
              } else {
                // Log the entire message and response for unknown issues
                logger.error('Failed to send chat message in drop reason:', {
                  broadcaster_id: providerAccountId,
                  drop_reason: dropReason,
                  message: text,
                  response,
                })
              }
            }
          } catch (error) {
            logger.error('Failed to send chat message in say', error)
          }
        }
      )

      socket.on('whisper', async (channel: string, text: string) => {
        try {
          const api = await getTwitchAPI()
          await api.whispers.sendWhisper(process.env.TWITCH_BOT_PROVIDERID!, channel, text)
        } catch (error) {
          logger.error('could not whisper', error)
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
  dropReason?: { code: string; message: string }
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
      cachedAt: new Date(cached.timestamp).toISOString(),
      dropReason: dropReason?.code,
      providerAccountId,
      userId: user.userId,
    })
    return
  }

  // Add to cache to prevent duplicates
  disableUserCache.set(cacheKey, {
    dropReason: dropReason?.code || 'unknown',
    providerAccountId,
    timestamp: now,
  })

  // Clean up expired cache entries
  for (const [key, value] of disableUserCache.entries()) {
    if (now - value.timestamp >= DISABLE_CACHE_EXPIRY) {
      disableUserCache.delete(key)
    }
  }

  // Create metadata based on the drop reason
  let metadata: DisableReasonMetadata = {
    drop_reason: dropReason?.code || 'unknown',
    drop_reason_message: dropReason?.message || 'Unknown chat permission issue',
  }

  // Add specific details based on drop reason code
  switch (dropReason?.code) {
    case 'followers_only_mode': {
      metadata = {
        ...metadata,
        additional_info: 'Bot is not a moderator and channel has followers-only mode enabled',
        permission_required: 'moderator',
      }
      break
    }
    case 'user_warned': {
      metadata = {
        ...metadata,
        additional_info:
          'Bot account is currently warned and cannot send messages until warning is acknowledged',
        warning_status: 'active',
      }
      break
    }
    default: {
      metadata = {
        ...metadata,
        additional_info: `Chat message blocked due to: ${dropReason?.message || 'Unknown reason'}`,
      }
      break
    }
  }

  await commandDisable.disable(user.userId, 'CHAT_PERMISSION_DENIED', metadata)

  logger.error('Failed to send chat message. Disabled user', {
    dropReason: dropReason?.code,
    dropReasonMessage: dropReason?.message,
    providerAccountId,
  })
}

// Start the service and handle any uncaught errors
startup().catch((error) => {
  logger.error('Fatal error during startup', error)
  process.exit(1)
})
