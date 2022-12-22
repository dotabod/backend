import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http'

import { getBotAPI } from './getBotAPI.js'

const apiClient = getBotAPI()

const listener = new EventSubHttpListener({
  // @ts-expect-error why?
  apiClient,
  adapter: new EnvPortAdapter({
    hostName: process.env.EVENTSUB_HOST!,
  }),
  secret: process.env.TWITCH_EVENTSUB_SECRET!,
  strictHostCheck: true,
})

await listener.start()

export { listener }
