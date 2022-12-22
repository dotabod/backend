import { DirectConnectionAdapter, EventSubHttpListener } from '@twurple/eventsub-http'
import './db/watcher.js'

const adapter = new DirectConnectionAdapter({
  hostName: 'events.dotabod.com',
  sslCert: {
    key: 'aaaaaaaaaaaaaaa',
    cert: 'bbbbbbbbbbbbbbb',
  },
})
const secret = process.env.TWITCH_EVENT_SECRET
const listener = new EventSubHttpListener({ apiClient, adapter, secret })
await listener.start()

export default { listener }
