import { io } from 'socket.io-client'

import { logger } from '../utils/logger.js'

export const steamSockets = [
  io('ws://steam:5035'),
  io('ws://steam:5036'),
  io('ws://steam:5037'),
  io('ws://steam:5038'),
]

export const [getRealTimeStatsSocket, getCardSocket, getCardsSocket, getUserSteamServerSocket] =
  steamSockets

getRealTimeStatsSocket.on('connect', () => {
  logger.info('We alive on dotabod steam server!')
})
