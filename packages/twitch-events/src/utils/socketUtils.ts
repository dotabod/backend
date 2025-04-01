import { Server } from 'socket.io'
import { logger } from '../twitch/lib/logger.js'
import { revokeEvent } from '../twitch/lib/revokeEvent.js'
import { handleNewUser } from '../handleNewUser'
import { botStatus } from '../botBanStatus.js'

export const socketIo = new Server(5015)

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

export const setupSocketIO = () => {
  socketIo.on('connection', async (socket) => {
    logger.info('[TWITCHEVENTS] Joining socket to room')
    await socket.join(DOTABOD_EVENTS_ROOM)

    logger.info('[TWITCHEVENTS] eventsIOConnected = true')
    eventsIOConnected = true

    socket.on('connect_error', (err) => {
      logger.info(`[TWITCHEVENTS] socket connect_error due to ${err.message}`)
      eventsIOConnected = false
    })

    socket.on('disconnect', () => {
      logger.info('[TWITCHEVENTS] Socket disconnected')
      eventsIOConnected = false
    })

    socket.on('reconnect', (attemptNumber) => {
      logger.info(`[TWITCHEVENTS] Socket reconnected on attempt ${attemptNumber}`)
      eventsIOConnected = true
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      logger.info(`[TWITCHEVENTS] Socket reconnect attempt ${attemptNumber}`)
    })

    socket.on('reconnect_failed', () => {
      logger.info('[TWITCHEVENTS] Socket failed to reconnect')
      eventsIOConnected = false
    })

    socket.on('grant', (providerAccountId: string) => {
      logger.info('[TWITCHEVENTS] Granting events for user', { providerAccountId })
      if (providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
        logger.info('Bot was granted in twitch-events!')
        botStatus.isBanned = false
      }
    })

    socket.on('revoke', (providerAccountId: string) => {
      logger.info('[TWITCHEVENTS] Revoking events for user', { providerAccountId })
      revokeEvent({ providerAccountId })
    })

    socket.on('enable', (providerAccountId: string) => {
      logger.info('[TWITCHEVENTS] Enabling events for user', { providerAccountId })
      handleNewUser(providerAccountId, true)
    })

    socket.on('resubscribe', (providerAccountId: string) => {
      logger.info('[TWITCHEVENTS] Resubscribing to events for user', { providerAccountId })
      handleNewUser(providerAccountId, true)
    })
  })
}
