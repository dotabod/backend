import { Server } from 'socket.io'
import type { Socket } from 'socket.io'

export const createSocketServer = function createSocketServer(
  onConnection: (socket: Socket, server: Server) => void,
  port = 5035
): Server {
  const server = new Server()
  server.on('connection', (socket) => {
    onConnection(socket, server)
  })
  return server.listen(port)
}
