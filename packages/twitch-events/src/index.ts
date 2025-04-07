import { checkBotStatus, logger } from '@dotabod/shared-utils'
import { fetchExistingSubscriptions, subsToCleanup } from './fetchExistingSubscriptions.js'
import { subscribeToEvents } from './subscribeToEvents.js'
import { deleteSubscription } from './twitch/lib/revokeEvent.js'
import { rateLimiter } from './utils/rateLimiterCore.js'
import { setupSocketIO } from './utils/socketUtils.js'
import { setupWebhooks } from './utils/webhookUtils.js'

const isBanned = await checkBotStatus()
if (isBanned) {
  logger.error('Bot is banned!')
}

setupSocketIO()
setupWebhooks()

await fetchExistingSubscriptions()

await subscribeToEvents()

try {
  logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })

  // Only process deletions if there are items to clean up
  if (subsToCleanup.length > 0) {
    // Process deletions in chunks to avoid overwhelming the rate limiter
    const CHUNK_SIZE = 30
    let completed = 0
    const startTime = Date.now()
    let lastLogTime = Date.now()

    for (let i = 0; i < subsToCleanup.length; i += CHUNK_SIZE) {
      const chunk = subsToCleanup.slice(i, i + CHUNK_SIZE)
      await Promise.all(
        chunk.map(async (subId) => {
          await rateLimiter.schedule(async () => {
            await deleteSubscription(subId)
            completed++

            // Log progress less frequently (every 500 items or every 10 seconds)
            const now = Date.now()
            const shouldLog =
              completed % 500 === 0 ||
              now - lastLogTime > 10000 ||
              completed === subsToCleanup.length

            if (shouldLog) {
              lastLogTime = now

              // Calculate progress metrics
              const percentComplete = Math.round((completed / subsToCleanup.length) * 100)
              const elapsedSec = (now - startTime) / 1000
              const estimatedTotalSec = elapsedSec / (completed / subsToCleanup.length)
              const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

              logger.info('[TWITCHEVENTS] Deletion progress', {
                completed,
                total: subsToCleanup.length,
                percent: `${percentComplete}%`,
                timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
                timeRemaining: `~${Math.round(remainingSec / 60)} minutes`,
                rateLimit: {
                  remaining: rateLimiter.rateLimitStatus.remaining,
                  queueLength: rateLimiter.queueLength,
                },
              })
            }
          })
        }),
      )
    }

    // Log final completion summary
    const totalTime = (Date.now() - startTime) / 1000
    logger.info('[TWITCHEVENTS] Deletion completed', {
      total: subsToCleanup.length,
      timing: {
        totalTime: `${Math.floor(totalTime / 60)}m ${Math.round(totalTime % 60)}s`,
        averageRate: `${Math.round(subsToCleanup.length / totalTime)} deletions/sec`,
      },
    })
  } else {
    logger.info('[TWITCHEVENTS] No subscriptions to clean up')
  }
} catch (error) {
  logger.error('[TWITCHEVENTS] Failed to cleanup subscriptions', {
    error: error instanceof Error ? error.message : String(error),
    count: subsToCleanup.length,
  })
}
