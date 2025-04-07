import { logger } from '@dotabod/shared-utils'
import { Server } from 'socket.io'

// Socket.io server instance
export const io = new Server(5005)

// Map to track connected sockets
const connectedSockets = new Map<string, boolean>()

// Check if any sockets are connected
export function hasDotabodSocket(): boolean {
  return connectedSockets.size > 0
}

// Add a socket to the connected sockets map
export function addSocket(socketId: string): void {
  connectedSockets.set(socketId, true)
}

// Remove a socket from the connected sockets map
export function removeSocket(socketId: string): void {
  connectedSockets.delete(socketId)
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
  io.on('connection', (socket) => {
    logger.info('Found a connection!')
    try {
      void socket.join('twitch-chat-messages')
      // Track this specific socket
      addSocket(socket.id)
    } catch (e) {
      logger.info('Could not join twitch-chat-messages socket')
      return
    }

    socket.on('reconnect', () => {
      logger.info('Reconnecting to the server')
      addSocket(socket.id)
    })

    socket.on('reconnect_failed', () => {
      logger.info('Reconnect failed')
      removeSocket(socket.id)
    })

    socket.on('reconnect_error', (error) => {
      logger.info('Reconnect error', error)
      removeSocket(socket.id)
    })

    socket.on('disconnect', (reason, details) => {
      logger.info(
        'We lost the server! Respond to all messages with "server offline"',
        reason,
        details,
      )
      removeSocket(socket.id)
    })
  })
}
