import { Server } from 'socket.io'
import { logger } from '../twitch/lib/logger.js'

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
  })
}
