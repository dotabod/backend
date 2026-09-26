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

import { ensureEventSubInitialized } from './conduit-setup'
import { clearDisableCache, DISABLE_CACHE_EXPIRY, disableUserCache } from './disable-cache'
import { isBlockingDropReason } from './drop-reasons'
import { isEventsubConnected } from './event-sub-socket'
import { sendTwitchChatMessage } from './handle-chat'
import { io, setupSocketServer } from './utils/socket-manager'

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

const isNonEmptyText = function isNonEmptyText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0
}

const textOrFallback = function textOrFallback(
  value: string | null | undefined,
  fallback: string
): string {
  return isNonEmptyText(value) ? value : fallback
}

if (!isNonEmptyText(process.env.TWITCH_BOT_PROVIDERID)) {
  throw new Error('TWITCH_BOT_PROVIDERID not set')
}

if (!isNonEmptyText(process.env.TWITCH_BOT_USERNAME)) {
  logger.warn('TWITCH_BOT_USERNAME not set, using "dotabod" as default')
  process.env.TWITCH_BOT_USERNAME = 'dotabod'
}

const disableUser = async function disableUser(
  providerAccountId: string,
  dropReason?: { code: string; message: string }
) {
  const { data: user } = await supabase
    .from('accounts')
    .select('userId')
    .eq('providerAccountId', providerAccountId)
    .single()

  const userId = user?.userId
  if (!isNonEmptyText(userId)) {
    logger.error('Failed to send chat message: no user found', providerAccountId)
    return
  }

  // Check if we've already disabled this user recently to prevent duplicate calls
  const dropReasonCode = textOrFallback(dropReason?.code, 'unknown')
  const cacheKey = `${userId}:${dropReasonCode}`
  const cached = disableUserCache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.timestamp < DISABLE_CACHE_EXPIRY) {
    logger.info('[DISABLE_CACHE] Skipping duplicate disable call', {
      cachedAt: new Date(cached.timestamp).toISOString(),
      dropReason: dropReason?.code,
      providerAccountId,
      userId,
    })
    return
  }

  // Add to cache to prevent duplicates
  disableUserCache.set(cacheKey, {
    dropReason: dropReasonCode,
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
    drop_reason: dropReasonCode,
    drop_reason_message: textOrFallback(dropReason?.message, 'Unknown chat permission issue'),
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
        additional_info: `Chat message blocked due to: ${textOrFallback(dropReason?.message, 'Unknown reason')}`,
      }
      break
    }
  }

  await commandDisable.disable(userId, 'CHAT_PERMISSION_DENIED', metadata)

  logger.error('Failed to send chat message. Disabled user', {
    dropReason: dropReason?.code,
    dropReasonMessage: dropReason?.message,
    providerAccountId,
  })
}

const say = async function say(
  providerAccountId: string,
  text: string,
  replyParentMessageId?: string
): Promise<void> {
  try {
    // Check if bot is banned before attempting to send message
    if (await checkBotStatus()) {
      return
    }

    const response = await sendTwitchChatMessage({
      broadcaster_id: providerAccountId,
      message: text || "I'm sorry, I can't do that",
      reply_parent_message_id: replyParentMessageId,
      sender_id: process.env.TWITCH_BOT_PROVIDERID ?? '',
    })
    const result = response.data?.[0]
    if (result?.is_sent) {
      return
    }

    const dropReason = result?.drop_reason
    if (dropReason?.code === undefined) {
      logger.error('Failed to send chat message in drop reason:', {
        broadcaster_id: providerAccountId,
        message: text,
        response,
      })
      return
    }

    if (isBlockingDropReason(dropReason.code)) {
      await disableUser(providerAccountId, dropReason)
      return
    }

    logger.warn('Chat message dropped, not disabling account:', {
      broadcaster_id: providerAccountId,
      drop_reason: dropReason,
      message: text,
    })
  } catch (error) {
    logger.error('Failed to send chat message in say', error)
  }
}

const startup = async function startup() {
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
      socket.on('say', (providerAccountId: string, text: string, replyParentMessageId?: string) => {
        void say(providerAccountId, text, replyParentMessageId)
      })

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

// Start the service and handle any uncaught errors
startup().catch((error) => {
  logger.error('Fatal error during startup', error)
  process.exit(1)
})
