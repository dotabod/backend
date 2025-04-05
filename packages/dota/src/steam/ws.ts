import { io } from 'socket.io-client'

import { logger } from '@dotabod/shared-utils'

export const steamSocket = io(`ws://${process.env.HOST_STEAM}:5035`)

steamSocket.on('connect', () => {
  logger.info('We alive on steamSocket steam server!')
})
