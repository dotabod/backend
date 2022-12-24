import './db/watcher.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { listener } from './twitch/lib/listener.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'

const accountIds = await getAccountIds()

const promises: Promise<any>[] = []
accountIds.forEach((userId) => {
  try {
    promises.push(
      listener.subscribeToStreamOnlineEvents(userId, onlineEvent),
      listener.subscribeToStreamOfflineEvents(userId, offlineEvent),
    )
  } catch (e) {
    console.log(e)
  }
})

Promise.all(promises)
  .then(() => console.log('done subbing to', accountIds.length, 'channels'))
  .catch((e) => {
    console.log(e)
  })
