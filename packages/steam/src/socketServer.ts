import { Server } from 'socket.io'

export function createSocketServer(port = 5035): Server {
  return new Server(port)
}

let _socketIoServer: Server | undefined

export function getSocketIoServer(): Server {
  if (!_socketIoServer) {
    _socketIoServer = createSocketServer()
  }
  return _socketIoServer
}
