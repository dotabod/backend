import './db/watcher.js'
import { SubscribeEvents } from './twitch/events/index.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'

// Load every account id when booting server
const accountIds = await getAccountIds()

SubscribeEvents(accountIds)
