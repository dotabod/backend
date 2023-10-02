import { io } from 'socket.io-client'

import { logger } from '../utils/logger.js'

export const steamSockets = [
  io('ws://steam:5035'),
  io('ws://steam-getCard:5036'),
  io('ws://steam-getCards:5037'),
  io('ws://steam-getUserSteamServer:5038'),
]

export const [getRealTimeStatsSocket, getCardSocket, getCardsSocket, getUserSteamServerSocket] =
  steamSockets

getRealTimeStatsSocket.on('connect', () => {
  logger.info('We alive on getRealTimeStatsSocket steam server!')
})

getCardSocket.on('connect', () => {
  logger.info('We alive on getCardSocket steam server!')
})

getCardsSocket.on('connect', () => {
  logger.info('We alive on getCardsSocket steam server!')
})

getUserSteamServerSocket.on('connect', () => {
  logger.info('We alive on getUserSteamServerSocket steam server!')
})
