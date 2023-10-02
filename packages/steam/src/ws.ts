import { io } from 'socket.io-client'

import { logger } from './utils/logger.js'

export const steamSockets = [io('ws://steam-getCard:5036'), io('ws://steam-getCards:5037')]

export const [getCardSocket, getCardsSocket] = steamSockets

getCardSocket.on('connect', () => {
  logger.info('We alive on getCardSocket steam server!')
})

getCardsSocket.on('connect', () => {
  logger.info('We alive on getCardsSocket steam server!')
})
