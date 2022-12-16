import RedisClient from '../db/redis.js'
import { setupMainEvents } from './events.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI from './server.js'

// Here's where we force wait for the redis to connect before starting the server
// Server depends on redis to be alive
const redisClient = RedisClient.getInstance()
await redisClient.connectClient()
await redisClient.connectSubscriber()
const { client: redis } = redisClient

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

server.events.on('new-gsi-client', (token: string) => {
  async function handler() {
    const client = await findUser(token)
    if (!client?.token) {
      console.log('[GSI]', 'Invalid user', { name: client?.name })
      return
    }

    console.log('[GSI]', 'Connecting new GSI client', { name: client.name })

    // Only setup main events if the OBS socket has connected
    const channels = await redis.pubSubChannels(`gsievents:${client.token}*`)
    if (channels.length) {
      // So the backend GSI events for twitch bot etc are setup
      // The new socketid will automatically get all new events to it as well
      // This usually only happens if they open two browser sources or add it multiple times
      // to obs for some reason
      console.log('[SOCKET]', 'Already setup event listeners', {
        name: client.name,
      })
      return
    }

    console.log('[GSI]', 'GSI connected', { name: client.name })
    const gsi = new setupMainEvents(token)
    await gsi.watchEvents()
  }

  void handler()
})
