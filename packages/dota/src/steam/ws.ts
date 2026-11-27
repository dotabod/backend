import { logger } from '@dotabod/shared-utils'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

type Emit = (...args: Parameters<Socket['emit']>) => void

export interface SteamSocket {
  readonly connected: boolean
  emit: Emit
  timeout: (timeoutMs: number) => {
    emit: Emit
    emitWithAck: (event: 'getVersion') => Promise<string | null>
  }
}

const steamConnection = io(`ws://${process.env.HOST_STEAM}:5035`)
export const steamSocket: SteamSocket = steamConnection
export const twitchChat: Socket = io(`ws://${process.env.HOST_TWITCH_CHAT}:5005`)
export const twitchEvents: Socket = io(`ws://${process.env.HOST_TWITCH_EVENTS}:5015`)

steamConnection.on('connect', () => {
  logger.info('We alive on steamSocket steam server!')
})

twitchChat.on('connect', () => {
  logger.info('We alive on dotabod chat server!')
})

twitchEvents.on('connect', () => {
  logger.info('We alive on dotabod twitch-events server!')
})
