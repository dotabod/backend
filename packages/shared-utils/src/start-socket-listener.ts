import { Server } from 'socket.io'
import type { DefaultEventsMap, ServerOptions, Socket } from 'socket.io'

export interface SocketListener<Events extends DefaultEventsMap = DefaultEventsMap> {
  close: () => Promise<void>
  port: number
  to: Server<DefaultEventsMap, Events>['to']
}

export function startSocketListener<
  Incoming extends DefaultEventsMap = DefaultEventsMap,
  Outgoing extends DefaultEventsMap = DefaultEventsMap,
>({
  onConnection,
  onConnectionError,
  options,
  port,
}: {
  onConnection: (socket: Socket<Incoming, Outgoing>) => void
  onConnectionError?: (error: { message: string }) => void
  options?: Partial<ServerOptions>
  port: number
}): SocketListener<Outgoing> {
  const server = new Server<Incoming, Outgoing>(options)
  server.on('connection', onConnection)
  server.listen(port)
  if (onConnectionError !== undefined) {
    server.engine.on('connection_error', onConnectionError)
  }

  const address = server.httpServer.address()
  return {
    close: async () => {
      await server.close()
    },
    port: typeof address === 'object' && address !== null ? address.port : port,
    to: (room) => server.to(room),
  }
}
