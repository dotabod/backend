import { setupMainEvents } from './events.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI, { events } from './server.js'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

events.on('new-gsi-client', (token: string) => {
  if (!token) {
    console.log('[GSI]', 'No token provided')
    return
  }

  const client = findUser(token)
  if (!client) {
    console.log('[GSI]', 'Could not find client', { token })
    return
  }

  console.log('[GSI]', 'Connecting new GSI client', { name: client.name })
  new setupMainEvents(client)
})

events.on('remove-gsi-client', (token: string) => {
  if (!token) {
    console.log('[REMOVE GSI]', 'No token provided')
    return
  }

  const client = findUser(token)
  if (!client) {
    console.log('[REMOVE GSI]', 'Could not find client', { token })
    return
  }

  console.log('[REMOVE GSI]', 'Removing GSI client', { name: client.name })
  events.eventNames().forEach((event) => {
    if (event.toString().includes(token)) {
      events.removeAllListeners(event)
    }
  })
})
