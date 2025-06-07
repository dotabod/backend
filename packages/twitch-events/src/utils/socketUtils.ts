import { logger } from '@dotabod/shared-utils'
import { botStatus } from '@dotabod/shared-utils'
import { fetchConduitId } from '@dotabod/shared-utils'
import { Server, type Socket } from 'socket.io'
import { handleNewUser } from '../handleNewUser.js'
import { revokeEvent } from '../twitch/lib/revokeEvent.js'

export const socketIo = new Server(5015, {
  cors: {
    origin: '*', // This allows any origin - adjust for production
    methods: ['GET', 'POST'],
  },
})

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

/**
 * Sends the conduit ID to the requesting client
 * @param socket - The socket.io socket to emit to
 * @param forceRefresh - Whether to force refresh the conduit ID
 */
async function sendConduitData(socket: Socket, forceRefresh = false) {
  try {
    logger.info('[TWITCHEVENTS] Getting conduit data', { forceRefresh })
    const conduitId = await fetchConduitId(forceRefresh)

    if (!conduitId) {
      logger.error('[TWITCHEVENTS] Failed to fetch conduit ID')
      socket.emit('conduitError', { error: 'Failed to fetch conduit ID' })
      return
    }

    logger.info('[TWITCHEVENTS] Sending conduit data', {
      conduitId: `${conduitId.substring(0, 8)}...`,
    })
    socket.emit('conduitData', { conduitId })
  } catch (error) {
    logger.error('[TWITCHEVENTS] Error fetching conduit data', {
      error: error instanceof Error ? error.message : String(error),
    })
    socket.emit('conduitError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

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

    // Handle conduit data requests from twitch-chat
    socket.on('getConduitData', (options = { forceRefresh: false }) => {
      sendConduitData(socket, options.forceRefresh)
    })

    socket.on('grant', (providerAccountId: string) => {
      logger.info('[TWITCHEVENTS] Granting events for user', { providerAccountId })
      if (providerAccountId === process.env.TWITCH_BOT_PROVIDERID) {
        logger.info('Bot was granted in twitch-events!')
        botStatus.isBanned = false
      }
    })

    socket.on('revoke', (providerAccountId: string) => {
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
