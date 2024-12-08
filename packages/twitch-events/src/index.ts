import { subsToCleanup } from './fetchExistingSubscriptions'
import { fetchExistingSubscriptions, subscribeToEvents } from './fetchExistingSubscriptions.js'
import { logger } from './twitch/lib/logger.js'
import { deleteSubscription } from './twitch/lib/revokeEvent.js'
import { setupSocketIO } from './utils/socketUtils.js'
import { setupWebhooks } from './utils/webhookUtils.js'

setupSocketIO()
setupWebhooks()

await fetchExistingSubscriptions()

try {
  logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })
  await Promise.all(subsToCleanup.map((subId) => deleteSubscription(subId)))
} catch (error) {
  logger.error('[TWITCHEVENTS] Failed to cleanup subscriptions', { error })
}

await subscribeToEvents()
