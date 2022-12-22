import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'

import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { getBotAPI } from './twitch/lib/getBotAPI.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'

const apiClient = getBotAPI()

const listener = new EventSubHttpListener({
  // @ts-expect-error why?
  apiClient,
  adapter: new EnvPortAdapter({
    hostName: process.env.EVENTSUB_HOST!
  }),
  secret: process.env.TWITCH_EVENTSUB_SECRET!,
  strictHostCheck: true,
})

await listener.start()

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

export default { listener }
