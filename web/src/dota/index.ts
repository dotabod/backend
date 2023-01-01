import { logger } from '../utils/logger.js'
import { setupMainEvents } from './events.js'
import { events } from './gsiEventEmitter.js'
import findUser from './lib/connectedStreamers.js'
import D2GSI from './server.js'

// Then setup the dota gsi server & websocket server
export const server = new D2GSI()

events.on('new-gsi-client', (token: string) => {
  if (!token) {
    logger.info('[GSI] No token provided')
    return
  }

  const client = findUser(token)
  if (!client) {
    logger.info('[GSI] Could not find client', { token })
    return
  }

  logger.info('[GSI] Connecting new client', { name: client.name })
  new setupMainEvents(client)
})

events.on('remove-gsi-client', (token: string) => {
  if (!token) {
    logger.info('[REMOVE GSI] No token provided')
    return
  }

  const client = findUser(token)
  if (!client) {
    logger.info('[REMOVE GSI] Could not find client', { token })
    return
  }

  logger.info('[REMOVE GSI] Removing GSI client', { name: client.name })
  events.eventNames().forEach((event) => {
    if (event.toString().includes(token)) {
      events.removeAllListeners(event)
    }
  })
})
