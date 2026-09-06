import type { GSIServerInterface, GsiSocketServer } from './gsi-server-types'

// Create a global variable to hold the server instance
// This avoids the top-level await export that's causing issues
let _server: Pick<GSIServerInterface, 'io'> | null = null

// Export a server object with accessor methods
export const server = {
  get io() {
    if (!_server) {
      throw new Error('Server not initialized yet')
    }
    return _server.io
  },
  setServer(serverInstance: { io: GsiSocketServer }) {
    _server = serverInstance
  },
}
