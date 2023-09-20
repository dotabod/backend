import { EventSubMiddleware } from '@twurple/eventsub-http'

import BotAPI from './twitch/lib/BotApiSingleton.js'
const { EVENTSUB_HOST, TWITCH_EVENTSUB_SECRET } = process.env

if (!EVENTSUB_HOST || !TWITCH_EVENTSUB_SECRET) {
  throw new Error('Missing EVENTSUB_HOST or TWITCH_EVENTSUB_SECRET')
}

export const middleware = new EventSubMiddleware({
  apiClient: BotAPI.getInstance(),
  legacySecrets: true,
  hostName: EVENTSUB_HOST,
  secret: TWITCH_EVENTSUB_SECRET,
  strictHostCheck: true,
})
