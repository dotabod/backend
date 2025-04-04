import { fetchConduitId } from './fetchConduitId.js'
import { initUserSubscriptions } from './initUserSubscriptions.js'
import { subscribeToAuthGrantOrRevoke } from './subscribeChatMessagesForUser.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { logger } from './twitch/lib/logger.js'
import { rateLimiter } from './utils/rateLimiter.js'

/**
 * Subscribe all users to Twitch events with optimized batching for scale
 * Designed to efficiently handle thousands of users
 */
export async function subscribeToEvents() {
  const conduitId = await fetchConduitId()
  logger.info('[TWITCHEVENTS] Subscribing to events', { conduitId })

  // First, subscribe to auth events which are global and not per-user
  await subscribeToAuthGrantOrRevoke(conduitId, process.env.TWITCH_CLIENT_ID!)

  // Get all account IDs that need subscriptions
  const accountIds = await getAccountIds()

  // Process accounts in chunks to avoid overwhelming the rate limiter
  // For 8000+ users, we need to be careful with rate limits and memory usage
  const CHUNK_SIZE = 20 // Increased from 10 to 20 for better throughput

  logger.info('[TWITCHEVENTS] Starting subscription process', {
    total: accountIds.length,
    chunks: Math.ceil(accountIds.length / CHUNK_SIZE),
    rateLimit: rateLimiter.rateLimitStatus,
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
        } catch (e) {
          // Categorize errors for better reporting
          const errorMessage = e instanceof Error ? e.message : String(e)
          const errorKey = errorMessage.substring(0, 100) // Truncate long messages
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
      }),
    )

    // Count successes
    successCount += results.filter((r) => r.status === 'fulfilled' && r.value === true).length

    // Log progress periodically
    const isLogPoint = (i + CHUNK_SIZE) % 200 === 0 || i + CHUNK_SIZE >= accountIds.length

    if (isLogPoint) {
      const processed = Math.min(i + CHUNK_SIZE, accountIds.length)
      const percentComplete = Math.round((processed / accountIds.length) * 100)
      const elapsedSec = (Date.now() - startTime) / 1000
      const estimatedTotalSec = elapsedSec / (processed / accountIds.length)
      const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

      logger.info('[TWITCHEVENTS] Subscription progress', {
        processed,
        total: accountIds.length,
        percent: `${percentComplete}%`,
        success: successCount,
        errors: errors.size > 0 ? Object.fromEntries(errors) : 'none',
        rateLimitRemaining: rateLimiter.rateLimitStatus.remaining,
        estimatedTimeRemaining: `${Math.round(remainingSec / 60)} minutes`,
        queueLength: rateLimiter.queueLength,
      })
    }
  }

  // Log final summary
  const totalTime = (Date.now() - startTime) / 1000
  logger.info('[TWITCHEVENTS] Subscription process completed', {
    total: accountIds.length,
    success: successCount,
    errorCount: accountIds.length - successCount,
    errorSummary: errors.size > 0 ? Object.fromEntries(errors) : 'none',
    timeElapsed: `${Math.round(totalTime / 60)} minutes ${Math.round(totalTime % 60)} seconds`,
  })
}
