import RedisClient from '../db/redis.js'
import { setupMainEvents } from './events.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI from './server.js'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()
const { client: redis } = RedisClient.getInstance()

// These next two events basically just check if Dota or OBS is opened first
// It then has to act appropriately and just call when both are ready
server.events.on('new-socket-client', ({ token, socketId }) => {
  async function handler() {
    // Hopefully there's a GSI already saved for this user
    const connectedSocketClient = await findUser(token)

    // Guess not lol, will be handled by `new-gsi-client` event
    if (!connectedSocketClient?.gsi) {
      console.log('[SOCKET]', 'Waiting for GSI after socket connection', {
        name: connectedSocketClient?.name,
      })
      return
    }

    const channels = await redis.pubSubChannels('gsievents:clbd1klbv0000i708ynp6b9y4*')
    if (channels.length) {
      // So the backend GSI events for twitch bot etc are setup
      // The new socketid will automatically get all new events to it as well
      // This usually only happens if they open two browser sources or add it multiple times
      // to obs for some reason
      console.log(
        '[SOCKET]',
        'Already setup event listeners for this client, lets setup OBS events',
        socketId,
        {
          name: connectedSocketClient.name,
        },
      )
      return
    }

    // Main events were never setup, so do it now that the socket is online
    // Setup main events with the GSI client, assuming it already connected
    console.log('[SOCKET]', 'GSI is connected, and now so is OBS for user:', {
      name: connectedSocketClient.name,
    })

    new setupMainEvents(connectedSocketClient)
  }

  void handler()
})

server.events.on('new-gsi-client', (token) => {
  if (!token) return

  async function handler() {
    const connectedSocketClient = await findUser(token)

    console.log('[GSI]', 'Connecting new GSI client', { name: connectedSocketClient?.name })

    // Only setup main events if the OBS socket has connected
    if (!connectedSocketClient?.sockets.length) {
      console.log('[GSI]', 'Waiting for OBS', { name: connectedSocketClient?.name })
      return
    }

    // This means OBS layer is available, but GSI connected AFTER
    console.log('[GSI]', 'Socket is connected and so is GSI', { name: connectedSocketClient.name })

    new setupMainEvents(connectedSocketClient)
  }

  void handler()
})
