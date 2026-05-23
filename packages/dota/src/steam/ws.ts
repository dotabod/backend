import { logger } from '@dotabod/shared-utils'
import { io } from 'socket.io-client'

export const steamSocket = io(`ws://${process.env.HOST_STEAM}:5035`)
export const twitchChat = io(`ws://${process.env.HOST_TWITCH_CHAT}:5005`)
export const twitchEvents = io(`ws://${process.env.HOST_TWITCH_EVENTS}:5015`)

steamSocket.on('connect', () => {
  logger.info('We alive on steamSocket steam server!')
})

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchEvents.on('connect', () => {
  logger.info('We alive on dotabod twitch-events server!')
})
