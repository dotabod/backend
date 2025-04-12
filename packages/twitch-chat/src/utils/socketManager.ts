import { logger } from '@dotabod/shared-utils'
import { Server } from 'socket.io'

// Socket.io server instance with improved connection handling
export const io = new Server(5005, {
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000, // Decrease ping interval for faster detection of disconnections
  connectTimeout: 45000, // Increase connection timeout
  cors: {
    origin: '*', // Allow all origins
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'], // Support both WebSocket and polling
})

// Map to track connected sockets
const connectedSockets = new Map<string, boolean>()

// Check if any sockets are connected
export function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

// Add a socket to the connected sockets map
export function addSocket(socketId: string): void {
  connectedSockets.set(socketId, true)
  logger.info(`Socket ${socketId} added, total sockets: ${connectedSockets.size}`)
}

// Remove a socket from the connected sockets map
export function removeSocket(socketId: string): void {
  connectedSockets.delete(socketId)
  logger.info(`Socket ${socketId} removed, remaining sockets: ${connectedSockets.size}`)
}

// Emit a chat message to connected sockets
export function emitChatMessage(
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
  },
): void {
  io.to('twitch-chat-messages').emit('msg', broadcasterLogin, chatterLogin, text, metadata)
}

// Emit an event to connected sockets
export function emitEvent(type: string, broadcasterId: string, data: any): void {
  io.to('twitch-chat-messages').emit('event', type, broadcasterId, data)
}

// Initialize socket connections
export function setupSocketServer(): void {
  // Set up error handling for the server
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.io server connection error:', err)
  })

  io.on('connection', (socket) => {
    logger.info(`Found a connection! Socket ID: ${socket.id}`)

    try {
      void socket.join('twitch-chat-messages')
      // Track this specific socket
      addSocket(socket.id)
    } catch (e) {
      logger.error('Could not join twitch-chat-messages socket', e)
      return
    }

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
  })
}
