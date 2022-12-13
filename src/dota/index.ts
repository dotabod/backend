import RedisClient from '../db/redis.js'
import { setupMainEvents } from './events.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI from './server.js'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()
const { client: redis } = RedisClient.getInstance()

server.events.on('new-gsi-client', (token: string) => {
  async function handler() {
    const connectedSocketClient = await findUser(token)
    if (!connectedSocketClient?.token) {
      console.log('[GSI]', 'Invalid user', { name: connectedSocketClient?.name })
      return
    }

    console.log('[GSI]', 'Connecting new GSI client', { name: connectedSocketClient?.name })

    // Only setup main events if the OBS socket has connected
    const channels = await redis.pubSubChannels(`gsievents:${connectedSocketClient.token}*`)
    if (channels.length) {
      // So the backend GSI events for twitch bot etc are setup
      // The new socketid will automatically get all new events to it as well
      // This usually only happens if they open two browser sources or add it multiple times
      // to obs for some reason
      console.log('[SOCKET]', 'Already setup event listeners', {
        name: connectedSocketClient.name,
      })
      return
    }

    console.log('[GSI]', 'GSI connected', { name: connectedSocketClient.name })
    new setupMainEvents(token)
  }

  void handler()
})
