import './events/gsiEventLoader.js'

import { logger } from '../utils/logger.js'
import { events } from './globalEventEmitter.js'
import { GSIHandler } from './GSIHandler.js'
import GSIServer from './GSIServer.js'
import findUser from './lib/connectedStreamers.js'

// Then setup the dota gsi server & websocket server
export const server = new GSIServer()

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
  new GSIHandler(client)
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
