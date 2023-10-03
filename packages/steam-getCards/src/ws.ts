import { io } from 'socket.io-client'

import { logger } from './utils/logger.js'

export const getCardSocket = io('ws://steam-getCard:5036')

getCardSocket.on('connect', () => {
  logger.info('We alive on getCardSocket steam server!')
})
