import type { Server } from 'socket.io'

/**
 * Interface for the GSIServer class
 */
export interface GSIServerInterface {
  /**
   * Socket.io server instance
   */
  io: Server

  /**
   * Initialize the GSI server
   * @returns The initialized server instance
   */
  init(): GSIServerInterface
}
