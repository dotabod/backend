import { checkBotStatus, logger } from '@dotabod/shared-utils'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { eventSubMap } from './chatSubIds.js'
import { ensureBotIsModerator } from './ensureBotIsModerator.js'
import { fetchConduitId } from './fetchConduitId.js'
import { genericSubscribe } from './subscribeChatMessagesForUser.js'

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId: conduitId ? `${conduitId.substring(0, 8)}...` : 'null' })

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

// Define critical subscription types that are essential for core functionality
const CRITICAL_SUBSCRIPTION_TYPES: (keyof TwitchEventTypes)[] = [
  'stream.online',
  'stream.offline',
  'user.update',
] as const

/**
 * Attempts to subscribe with retry logic for critical subscription types
 * @param type The subscription type
 * @param providerAccountId The broadcaster's Twitch ID
 * @returns true if successful, false otherwise
 */
async function subscribeWithRetry(
  type: keyof TwitchEventTypes,
  providerAccountId: string,
  isCritical: boolean,
): Promise<boolean> {
  const maxRetries = isCritical ? 3 : 1
  let lastError: Error | null = null

  // Validate conduit ID to prevent unnecessary API calls
  if (!conduitId) {
    logger.error('[TWITCHEVENTS] Missing conduit ID for subscription', {
      providerAccountId,
      type,
    })
    return false
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const success = await genericSubscribe(conduitId, providerAccountId, type)
      if (success) {
        if (attempt > 1) {
          logger.info('[TWITCHEVENTS] Subscription succeeded after retry', {
            type,
            providerAccountId,
            attempt,
          })
        }
        return true
      }
    } catch (error) {
      lastError = error as Error
      logger.debug('[TWITCHEVENTS] Subscription attempt failed', {
        type,
        providerAccountId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })

      // No need to retry if not a critical subscription
      if (!isCritical) break

      // Only retry for specific error types (e.g., rate limiting, network issues)
      if (
        error instanceof Error &&
        (error.message.includes('Rate limit') || error.message.includes('network'))
      ) {
        // Exponential backoff - wait longer for each retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      } else {
        // Don't retry for other error types (like authorization errors)
        break
      }
    }
  }
  // Log only if all retries failed
  if (isCritical) {
    logger.error('[TWITCHEVENTS] Failed to create critical subscription after retries', {
      type,
      providerAccountId,
      error: lastError
        ? typeof lastError === 'object'
          ? JSON.stringify(lastError, Object.getOwnPropertyNames(lastError))
          : String(lastError)
        : 'Unknown error',
      errorType: lastError ? typeof lastError : 'null',
      errorStack:
        lastError && typeof lastError === 'object' ? (lastError as Error).stack : undefined,
    })
  } else {
    // Log non-critical failures too
    logger.warn('[TWITCHEVENTS] Failed to create non-critical subscription', {
      type,
      providerAccountId,
      error: lastError
        ? typeof lastError === 'object'
          ? JSON.stringify(lastError, Object.getOwnPropertyNames(lastError))
          : String(lastError)
        : 'Unknown error',
    })
  }

  return false
}

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

    // Track success rate for metrics
    const results = {
      total: 0,
      success: 0,
      failed: 0,
      criticalSuccess: 0,
      criticalFailed: 0,
    }

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

      // Process critical subscriptions first to ensure core functionality
      const missingCritical = missingTypes.filter((type) =>
        CRITICAL_SUBSCRIPTION_TYPES.includes(type),
      )

      const missingSecondary = missingTypes.filter(
        (type) => !CRITICAL_SUBSCRIPTION_TYPES.includes(type),
      )

      // Subscribe to missing critical types first
      results.total += missingCritical.length
      for (const type of missingCritical) {
        const success = await subscribeWithRetry(type, providerAccountId, true)
        if (success) {
          results.success++
          results.criticalSuccess++
        } else {
          results.failed++
          results.criticalFailed++
        }
      }

      // Then subscribe to non-critical types
      results.total += missingSecondary.length
      for (const type of missingSecondary) {
        const success = await subscribeWithRetry(type, providerAccountId, false)
        if (success) {
          results.success++
        } else {
          results.failed++
        }
      }

      // Log summary if we had to fix anything
      if (results.total > 0) {
        logger.info('[TWITCHEVENTS] Fixed missing subscriptions', {
          providerAccountId,
          fixed: results.success,
          failed: results.failed,
          criticalFixed: results.criticalSuccess,
          criticalFailed: results.criticalFailed,
        })
      }
    } else {
      // For new users or users with no subscriptions, subscribe to all required types at once
      const subscriptionTypes = REQUIRED_SUBSCRIPTION_TYPES.filter(
        (type) => !(type === 'channel.chat.message' && isBanned),
      )

      // Process critical subscriptions first
      const criticalTypes = subscriptionTypes.filter((type) =>
        CRITICAL_SUBSCRIPTION_TYPES.includes(type),
      )

      const secondaryTypes = subscriptionTypes.filter(
        (type) => !CRITICAL_SUBSCRIPTION_TYPES.includes(type),
      )

      // Subscribe to critical types with retry logic
      results.total += criticalTypes.length
      for (const type of criticalTypes) {
        const success = await subscribeWithRetry(type, providerAccountId, true)
        if (success) {
          results.success++
          results.criticalSuccess++
        } else {
          results.failed++
          results.criticalFailed++
        }
      }

      // Subscribe to secondary types
      results.total += secondaryTypes.length
      for (const type of secondaryTypes) {
        const success = await subscribeWithRetry(type, providerAccountId, false)
        if (success) {
          results.success++
        } else {
          results.failed++
        }
      }

      // Log overall subscription results
      logger.info('[TWITCHEVENTS] Initial subscription setup', {
        providerAccountId,
        total: results.total,
        success: results.success,
        failed: results.failed,
        criticalSuccess: results.criticalSuccess,
        criticalFailed: results.criticalFailed,
      })

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

    // Return true only if all critical subscriptions succeeded
    return results.criticalFailed === 0
  } catch (error) {
    // Log errors but don't block processing of other users
    logger.error('[TWITCHEVENTS] Error in subscription setup', {
      error: error instanceof Error ? error.message : String(error),
      providerAccountId,
    })
    return false
  }
}
