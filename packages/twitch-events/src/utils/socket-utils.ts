import { botStatus, fetchConduitId, logger } from '@dotabod/shared-utils'
import type { Json } from '@dotabod/shared-utils'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import { z } from 'zod'

import { handleNewUser } from '../handle-new-user'
import { revokeEvent } from '../twitch/lib/revoke-event'
import { createSocketUserActions } from './socket-user-actions'

interface ClientToServerEvents {
  enable: (providerAccountId: string) => void
  getConduitData: (options?: Json) => void
  getVersion: (acknowledge: (commitHash: string | null) => void) => void
  grant: (providerAccountId: string) => void
  resubscribe: (providerAccountId: string) => void
  revoke: (providerAccountId: string) => void
}

interface ServerToClientEvents {
  conduitData: (payload: { conduitId: string }) => void
  conduitError: (payload: { error: string }) => void
}

type EventSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const conduitOptionsSchema = z.object({ forceRefresh: z.boolean().optional() })

const socketIo = new Server<ClientToServerEvents, ServerToClientEvents>(5015, {
  cors: {
    methods: ['GET', 'POST'],
    // This allows any origin - adjust for production,
    origin: '*',
  },
})

// the socketio hooks onto the listener http server that it creates
const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
const connectedClients = new Set<string>()

export const isEventsIOConnected = function isEventsIOConnected(): boolean {
  return connectedClients.size > 0
}

const sendConduitData = async function sendConduitData(
  socket: EventSocket,
  forceRefresh: boolean
): Promise<void> {
  try {
    logger.info('[TWITCHEVENTS] Getting conduit data', { forceRefresh })
    const conduitId = await fetchConduitId(forceRefresh)

    if (conduitId === null || conduitId.length === 0) {
      logger.error('[TWITCHEVENTS] Failed to fetch conduit ID')
      socket.emit('conduitError', { error: 'Failed to fetch conduit ID' })
      return
    }

    logger.info('[TWITCHEVENTS] Sending conduit data', {
      conduitId: `${conduitId.slice(0, 8)}...`,
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

export const { onSocketEnable, onSocketResubscribe } = createSocketUserActions({
  handleNewUser,
  logger,
})

const registerSocket = async function registerSocket(socket: EventSocket): Promise<void> {
  try {
    logger.info('[TWITCHEVENTS] Joining socket to room')
    await socket.join(DOTABOD_EVENTS_ROOM)

    // Track liveness by connected-client count so a reconnecting client's old
    // socket disconnecting can't strand the flag false while a new one is live.
    connectedClients.add(socket.id)
    logger.info('[TWITCHEVENTS] client connected', { clients: connectedClients.size })

    socket.on('disconnect', () => {
      connectedClients.delete(socket.id)
      logger.info('[TWITCHEVENTS] Socket disconnected', { clients: connectedClients.size })
    })

    socket.on('getVersion', (ack: (commitHash: string | null) => void) => {
      ack(process.env.COMMIT_HASH ?? null)
    })

    // Handle conduit data requests from twitch-chat
    socket.on('getConduitData', (options) => {
      const parsedOptions = conduitOptionsSchema.safeParse(options)
      const forceRefresh = parsedOptions.success
        ? (parsedOptions.data.forceRefresh ?? false)
        : false
      void sendConduitData(socket, forceRefresh)
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
      void onSocketEnable(providerAccountId)
    })

    socket.on('resubscribe', (providerAccountId: string) => {
      void onSocketResubscribe(providerAccountId)
    })
  } catch (error) {
    logger.error('[TWITCHEVENTS] Failed to register socket', { error })
  }
}

export const setupSocketIO = function setupSocketIO(): void {
  socketIo.on('connection', (socket) => {
    void registerSocket(socket)
  })
}
