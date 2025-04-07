import type GSIServer from './GSIServer.js'

// Create a global variable to hold the server instance
// This avoids the top-level await export that's causing issues
let _server: GSIServer | null = null

// Export a server object with accessor methods
export const server = {
  get io() {
    if (!_server) {
      throw new Error('Server not initialized yet')
    }
    return _server.io
  },
  setServer(serverInstance: GSIServer) {
    _server = serverInstance
  },
}
