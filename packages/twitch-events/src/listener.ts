import { EventSubHttpListener, ReverseProxyAdapter } from '@twurple/eventsub-http'
import { getBotInstance } from './twitch/lib/BotApiSingleton.js'

const { EVENTSUB_HOST, TWITCH_EVENTSUB_SECRET } = process.env

if (!EVENTSUB_HOST || !TWITCH_EVENTSUB_SECRET) {
  throw new Error('Missing EVENTSUB_HOST or TWITCH_EVENTSUB_SECRET')
}

export const listener = new EventSubHttpListener({
  apiClient: getBotInstance(),
  legacySecrets: true,
  adapter: new ReverseProxyAdapter({
    hostName: EVENTSUB_HOST, // The host name the server is available from
    port: 5010, // The port to listen on, defaults to 8080
  }),
  secret: TWITCH_EVENTSUB_SECRET,
  strictHostCheck: true,
})
