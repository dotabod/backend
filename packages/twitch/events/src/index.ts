import { listener } from './listener.js'
import { SubscribeEvents } from './SubscribeEvents.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { setupSocketIO } from './utils/socketUtils.js'
import { setupWebhooks } from './utils/webhookUtils.js'

listener.start()

// Load every account id when booting server
getAccountIds()
  .then((accountIds) => {
    console.log('[TWITCHEVENTS] Retrieved accountIds', { length: accountIds.length })
    SubscribeEvents(accountIds)
  })
  .catch((e) => {
    console.log('[TWITCHEVENTS] error getting accountIds', { e })
  })

setupSocketIO()
setupWebhooks()
