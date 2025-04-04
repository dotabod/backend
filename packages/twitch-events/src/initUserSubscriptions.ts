import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { genericSubscribe } from './subscribeChatMessagesForUser.js'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { logger } from './twitch/lib/logger.js'
import { checkBotStatus } from './botBanStatus'
import { ensureBotIsModerator } from './ensureBotIsModerator.js'

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })

// For migrating users from old eventsub to new conduit
// We should check if the user has the chat message sub
// If they do not, we should revoke the old eventsub and re-subscribe to the new conduit

// Define required subscription types
const REQUIRED_SUBSCRIPTION_TYPES: (keyof TwitchEventTypes)[] = [
  'channel.chat.message',
  'stream.offline',
  'stream.online',
  'user.update',
  'channel.prediction.begin',
  'channel.prediction.progress',
  'channel.prediction.lock',
  'channel.prediction.end',
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end',
] as const

/**
 * Initialize or update Twitch EventSub subscriptions for a user
 * Optimized for scale - minimizes API calls and logging
 */
export const initUserSubscriptions = async (providerAccountId: string) => {
  const isBanned = await checkBotStatus()

  try {
    // Check which subscriptions already exist
    const existingSubscriptions = eventSubMap[providerAccountId] || {}
    const existingTypes = Object.keys(existingSubscriptions) as (keyof TwitchEventTypes)[]

    // Only log detailed info for accounts with issues
    if (existingTypes.length > 0) {
      // Check for missing required subscriptions
      const missingTypes = REQUIRED_SUBSCRIPTION_TYPES.filter(
        (type) => !existingTypes.includes(type) && !(type === 'channel.chat.message' && isBanned),
      )

      if (missingTypes.length === 0) {
        // All subscriptions exist, nothing to do
        return
      }

      // Only subscribe to missing types - minimal work at scale
      await Promise.allSettled(
        missingTypes.map((type) => genericSubscribe(conduitId, providerAccountId, type)),
      )

      // Only log warnings if we had to fix something
      if (missingTypes.includes('stream.online')) {
        logger.warn('[TWITCHEVENTS] Fixed missing stream.online subscription', {
          providerAccountId,
        })
      }
    } else {
      // For new users or users with no subscriptions, subscribe to all required types at once
      const subscriptionPromises = REQUIRED_SUBSCRIPTION_TYPES.filter(
        (type) => !(type === 'channel.chat.message' && isBanned),
      ).map((type) => genericSubscribe(conduitId, providerAccountId, type))

      await Promise.allSettled(subscriptionPromises)

      // Only try to set moderator status if not banned (this is an expensive operation)
      if (!isBanned) {
        await ensureBotIsModerator(providerAccountId).catch((error) => {
          // Just log the error but don't crash the process
          logger.debug('[TWITCHEVENTS] Failed to set moderator status', {
            providerAccountId,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }
    }
  } catch (error) {
    // Log errors but don't block processing of other users
    logger.error('[TWITCHEVENTS] Error in subscription setup', {
      error: error instanceof Error ? error.message : String(error),
      providerAccountId,
    })
  }
}
