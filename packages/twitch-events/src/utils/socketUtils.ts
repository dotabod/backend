import { botStatus, fetchConduitId, logger } from '@dotabod/shared-utils'
import { Server, type Socket } from 'socket.io'
import { handleNewUser } from '../handleNewUser'
import { revokeEvent } from '../twitch/lib/revokeEvent'

export const socketIo = new Server(5015, {
  cors: {
    origin: '*', // This allows any origin - adjust for production
    methods: ['GET', 'POST'],
  },
})

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false
const connectedClients = new Set<string>()

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

    // Track liveness by connected-client count so a reconnecting client's old
    // socket disconnecting can't strand the flag false while a new one is live.
    connectedClients.add(socket.id)
    eventsIOConnected = true
    logger.info('[TWITCHEVENTS] client connected', { clients: connectedClients.size })

    socket.on('disconnect', () => {
      connectedClients.delete(socket.id)
      eventsIOConnected = connectedClients.size > 0
      logger.info('[TWITCHEVENTS] Socket disconnected', { clients: connectedClients.size })
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
