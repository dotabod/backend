interface SocketBroadcastTarget {
  emit: (event: string, ...args: unknown[]) => unknown
}

export interface GsiSocketServer {
  fetchSockets: () => Promise<unknown[]>
  to: (room: string) => SocketBroadcastTarget
}

/**
 * Interface for the GSIServer class
 */
export interface GSIServerInterface {
  /**
   * Socket.io server instance
   */
  io: GsiSocketServer

  /**
   * Initialize the GSI server
   * @returns The initialized server instance
   */
  init: () => GSIServerInterface
}
