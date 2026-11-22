import { logger } from '@dotabod/shared-utils'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'

// Socket.io server instance with improved connection handling. The port opens in
// setupSocketServer, once every connection handler is attached.
export const io = new Server({
  connectTimeout: 45_000,
  cors: {
    methods: ['GET', 'POST'],
    origin: '*',
  },
  pingInterval: 25_000,
  pingTimeout: 60_000,
  transports: ['websocket', 'polling'],
})

const connectedSockets = new Map<string, boolean>()

export const hasDotabodSocket = function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

const addSocket = function addSocket(socketId: string): void {
  connectedSockets.set(socketId, true)
  logger.info(`Socket ${socketId} added, total sockets: ${connectedSockets.size}`)
}

const removeSocket = function removeSocket(socketId: string): void {
  connectedSockets.delete(socketId)
  logger.info(`Socket ${socketId} removed, remaining sockets: ${connectedSockets.size}`)
}

export const emitChatMessage = function emitChatMessage(
  broadcasterLogin: string,
  chatterLogin: string,
  text: string,
  metadata: {
    channelId: string
    userInfo: {
      isMod: boolean
      isBroadcaster: boolean
      isSubscriber: boolean
      userId: string
    }
    messageId: string
  }
): void {
  io.to('twitch-chat-messages').emit('msg', broadcasterLogin, chatterLogin, text, metadata)
}

export const emitEvent = function emitEvent(
  type: string,
  broadcasterId: string,
  data: unknown
): void {
  io.to('twitch-chat-messages').emit('event', type, broadcasterId, data)
}

// Attach every connection handler, then open the port. dota reconnects within a second
// of a twitch-chat restart; a socket accepted before its handlers exist never joins the
// chat room or gets a 'say' listener, and stays that way until dota reconnects (prod
// 2026-09-26: 22h of unanswered commands after a twitch-chat-only redeploy).
export const setupSocketServer = function setupSocketServer(
  onConnection: (socket: Socket) => void,
  port = 5005
): void {
  io.on('connection', (socket) => {
    logger.info(`Found a connection! Socket ID: ${socket.id}`)

    try {
      void socket.join('twitch-chat-messages')
      addSocket(socket.id)
    } catch (error) {
      logger.error('Could not join twitch-chat-messages socket', error)
      return
    }

    socket.on('getVersion', (ack: (commitHash: string | null) => void) => {
      ack(process.env.COMMIT_HASH ?? null)
    })

    socket.on('reconnect', () => {
      logger.info(`Reconnecting to the server. Socket ID: ${socket.id}`)
      addSocket(socket.id)
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      logger.info(`Reconnection attempt #${attemptNumber}. Socket ID: ${socket.id}`)
    })

    socket.on('reconnect_failed', () => {
      logger.error(`Reconnect failed. Socket ID: ${socket.id}`)
      removeSocket(socket.id)
    })

    socket.on('reconnect_error', (error) => {
      logger.error(`Reconnect error. Socket ID: ${socket.id}`, error)
      removeSocket(socket.id)
    })

    socket.on('error', (error) => {
      logger.error(`Socket error. Socket ID: ${socket.id}`, error)
    })

    socket.on('disconnect', (reason, details) => {
      logger.info(`Socket disconnected. Socket ID: ${socket.id}. Reason: ${reason}`, details)
      removeSocket(socket.id)
    })

    onConnection(socket)
  })

  io.listen(port)

  io.engine.on('connection_error', (err) => {
    logger.error('Socket.io server connection error:', err)
  })
}
