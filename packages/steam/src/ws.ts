import { io } from 'socket.io-client'

import { logger } from './utils/logger.js'

export const getCardsSocket = io('ws://steam-getCards:5037')

getCardsSocket.on('connect', () => {
  logger.info('We alive on getCardsSocket steam server!')
})
