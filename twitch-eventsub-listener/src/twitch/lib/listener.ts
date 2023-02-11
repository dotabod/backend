import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'

import { getBotAPIStatic } from './getBotAPIStatic.js'

const apiClient = getBotAPIStatic()

const listener = new EventSubHttpListener({
  apiClient,
  adapter: new EnvPortAdapter({
    hostName: process.env.EVENTSUB_HOST!,
  }),
  secret: process.env.TWITCH_EVENTSUB_SECRET!,
  strictHostCheck: true,
})

await listener.start()

export { listener }
