import { subsToCleanup } from './fetchExistingSubscriptions'
import { fetchExistingSubscriptions, subscribeToEvents } from './fetchExistingSubscriptions.js'
import { logger } from './twitch/lib/logger.js'
import { deleteSubscription } from './twitch/lib/revokeEvent.js'
import { rateLimiter } from './utils/rateLimiter.js'
import { setupSocketIO } from './utils/socketUtils.js'
import { setupWebhooks } from './utils/webhookUtils.js'

setupSocketIO()
setupWebhooks()

await fetchExistingSubscriptions()

try {
  logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })
  // Process deletions in chunks to avoid overwhelming the rate limiter
  const CHUNK_SIZE = 10
  for (let i = 0; i < subsToCleanup.length; i += CHUNK_SIZE) {
    const chunk = subsToCleanup.slice(i, i + CHUNK_SIZE)
    await Promise.all(chunk.map((subId) => rateLimiter.schedule(() => deleteSubscription(subId))))
  }
} catch (error) {
  logger.error('[TWITCHEVENTS] Failed to cleanup subscriptions', { error })
}

await subscribeToEvents()
