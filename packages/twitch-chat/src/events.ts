import { logger } from '@dotabod/shared-utils'
import { io as socketIo } from 'socket.io-client'

export const twitchEvent = socketIo(`ws://${process.env.HOST_TWITCH_EVENTS}:5015`)
twitchEvent.on('connect', () => {
  logger.info('We alive on dotabod twitch events server!')
})
