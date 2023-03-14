import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'

import BotAPI from './BotApiSingleton.js'
const botApi = BotAPI.getInstance()

// TODO: Remove this next time you push to production
console.log('delete all v5 subs, only should run once')
await botApi.eventSub.deleteAllSubscriptions()

console.log('Create the event sub listener')
const listener = new EventSubHttpListener({
  apiClient: botApi,
  adapter: new EnvPortAdapter({
    hostName: process.env.EVENTSUB_HOST!,
  }),
  secret: process.env.TWITCH_EVENTSUB_SECRET!,
  strictHostCheck: true,
})

console.log('Start the event sub listener')
listener.start()
console.log('Started the event sub listener')

export { listener }
