process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

import { checkBotStatus, logger } from '@dotabod/shared-utils'
import { fetchExistingSubscriptions, subsToCleanup } from './fetchExistingSubscriptions'
import { subscribeToEvents } from './subscribeToEvents'
import { deleteSubscription } from './twitch/lib/revokeEvent'
import { rateLimiter } from './utils/rateLimiterCore'
import { setupSocketIO } from './utils/socketUtils'
import { setupWebhooks } from './utils/webhookUtils'

const isBanned = await checkBotStatus()
if (isBanned) {
  logger.error('Bot is banned!')
}

setupSocketIO()
setupWebhooks()

void (async () => {
  try {
    await fetchExistingSubscriptions()

    await subscribeToEvents()

    logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })

    if (subsToCleanup.length > 0) {
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

              const now = Date.now()
              const shouldLog =
                completed % 500 === 0 ||
                now - lastLogTime > 10000 ||
                completed === subsToCleanup.length

              if (shouldLog) {
                lastLogTime = now

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
    logger.error('[TWITCHEVENTS] Background reconciliation failed', {
      error: error instanceof Error ? error.message : String(error),
      count: subsToCleanup.length,
    })
  }
})()
