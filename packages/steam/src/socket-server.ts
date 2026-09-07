import { Server } from 'socket.io'

export const createSocketServer = function createSocketServer(port = 5035): Server {
  return new Server(port)
}

let _socketIoServer: Server | undefined

export const getSocketIoServer = function getSocketIoServer(): Server {
  _socketIoServer ??= createSocketServer()
  return _socketIoServer
}
