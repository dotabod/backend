import './db/watcher.js'
import { SubscribeEvents } from './twitch/events/index.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'

console.log("Let's get started")

// Load every account id when booting server
const accountIds = await getAccountIds()

console.log('Retrieved accountIds', accountIds.length)

SubscribeEvents(accountIds)
