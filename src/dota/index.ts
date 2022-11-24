import { setupMainEvents } from './events'
import findUser from './lib/connectedStreamers'
import D2GSI from './server'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

// These next two events basically just check if Dota or OBS is opened first
// It then has to act appropriately and just call when both are ready
server.events.on('new-socket-client', ({ client, socketId }) => {
  // Hopefully there's a GSI already saved for this user
  const connectedSocketClient = findUser(client.token)

  // Guess not lol, will be handled by `new-gsi-client` event
  if (!connectedSocketClient?.gsi) {
    console.log('[SOCKET]', 'Waiting for GSI after socket connection', {
      name: connectedSocketClient?.name,
    })
    return
  }

  const count = connectedSocketClient.gsi.listenerCount('map:clock_time')

  if (count) {
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
})

server.events.on('new-gsi-client', (client: { token: string }) => {
  if (!client.token) return

  const connectedSocketClient = findUser(client.token)
  console.log('[GSI]', 'Connecting new GSI client', { name: connectedSocketClient?.name })

  // Only setup main events if the OBS socket has connected
  if (!connectedSocketClient?.sockets.length) {
    console.log('[GSI]', 'Waiting for OBS', { name: connectedSocketClient?.name })
    return
  }

  // This means OBS layer is available, but GSI connected AFTER
  console.log('[GSI]', 'Socket is connected and so is GSI', { name: connectedSocketClient.name })

  new setupMainEvents(connectedSocketClient)
})
