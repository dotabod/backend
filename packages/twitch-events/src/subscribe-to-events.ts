import { fetchConduitId, logger } from '@dotabod/shared-utils'

import { initUserSubscriptions } from './init-user-subscriptions'
import { subscribeToAuthGrantOrRevoke } from './subscribe-chat-messages-for-user'
import { getAccountIds } from './twitch/lib/get-account-ids'
import { rateLimiter } from './utils/rate-limiter-core'

export const subscribeToEvents = async function subscribeToEvents() {
  const conduitId = await fetchConduitId()
  logger.info('[TWITCHEVENTS] Subscribing to events', { conduitId })

  if (!conduitId) {
    logger.error('[TWITCHEVENTS] No conduit ID found')
    return
  }

  // First, subscribe to auth events which are global and not per-user
  await subscribeToAuthGrantOrRevoke(conduitId, process.env.TWITCH_CLIENT_ID!)

  // Get all account IDs that need subscriptions
  const accountIds = await getAccountIds()

  if (accountIds.length === 0) {
    logger.info('[TWITCHEVENTS] No accounts to subscribe to')
    return
  }

  // Process accounts in chunks to avoid overwhelming the rate limiter
  // For 8000+ users, we need to be careful with rate limits and memory usage
  const CHUNK_SIZE = 30

  logger.info('[TWITCHEVENTS] Starting subscription process', {
    chunks: Math.ceil(accountIds.length / CHUNK_SIZE),
    rateLimit: rateLimiter.rateLimitStatus,
    total: accountIds.length,
  })

  // Track errors for summary reporting
  const errors = new Map<string, number>()
  let successCount = 0
  const startTime = Date.now()

  for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
    const chunk = accountIds.slice(i, i + CHUNK_SIZE)

    // Process each chunk with appropriate error handling
    const results = await Promise.allSettled(
      chunk.map(async (providerAccountId) => {
        try {
          await initUserSubscriptions(providerAccountId)
          return true
        } catch (error) {
          // Categorize errors for better reporting
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Truncate long messages
          const errorKey = errorMessage.slice(0, 100)
          errors.set(errorKey, (errors.get(errorKey) || 0) + 1)

          // Only log detailed errors for the first few occurrences
          if ((errors.get(errorKey) || 0) <= 5) {
            logger.error('[TWITCHEVENTS] Subscription error', {
              error: errorMessage,
              providerAccountId,
            })
          }
          return false
        }
      })
    )

    // Count successes
    successCount += results.filter((r) => r.status === 'fulfilled' && r.value).length

    // Log progress periodically
    const isLogPoint = (i + CHUNK_SIZE) % 200 === 0 || i + CHUNK_SIZE >= accountIds.length

    if (isLogPoint) {
      const processed = Math.min(i + CHUNK_SIZE, accountIds.length)
      const percentComplete = Math.round((processed / accountIds.length) * 100)
      const elapsedSec = (Date.now() - startTime) / 1000
      const estimatedTotalSec = elapsedSec / (processed / accountIds.length)
      const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

      logger.info('[TWITCHEVENTS] Subscription progress', {
        errors: errors.size > 0 ? Object.fromEntries(errors) : 'none',
        estimatedTimeRemaining: `${Math.round(remainingSec / 60)} minutes`,
        percent: `${percentComplete}%`,
        processed,
        queueLength: rateLimiter.queueLength,
        rateLimitRemaining: rateLimiter.rateLimitStatus.remaining,
        success: successCount,
        total: accountIds.length,
      })
    }
  }

  // Log final summary
  const totalTime = (Date.now() - startTime) / 1000
  logger.info('[TWITCHEVENTS] Subscription process completed', {
    errorCount: accountIds.length - successCount,
    errorSummary: errors.size > 0 ? Object.fromEntries(errors) : 'none',
    success: successCount,
    timeElapsed: `${Math.round(totalTime / 60)} minutes ${Math.round(totalTime % 60)} seconds`,
    total: accountIds.length,
  })
}
