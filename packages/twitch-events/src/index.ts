import { fetchExistingSubscriptions, subscribeToEvents } from './fetchExistingSubscriptions.js'
import { setupSocketIO } from './utils/socketUtils.js'
import { setupWebhooks } from './utils/webhookUtils.js'

setupSocketIO()
setupWebhooks()

await fetchExistingSubscriptions()
await subscribeToEvents()
