import { setupMainEvents } from './events.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI, { events } from './server.js'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

events.on('new-gsi-client', (token: string) => {
  if (!token) return

  const connectedSocketClient = findUser(token)
  if (!connectedSocketClient) return

  console.log('[GSI]', 'Connecting new GSI client', { name: connectedSocketClient.name })
  new setupMainEvents(connectedSocketClient)
})
