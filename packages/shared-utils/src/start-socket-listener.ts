import { Server } from 'socket.io'
import type { DefaultEventsMap, ServerOptions, Socket } from 'socket.io'
import { z } from 'zod'

type SocketEvents<Events> = Record<keyof Events, (...args: never[]) => void>

const tcpAddress = z.object({ port: z.number() })

export interface SocketListener<Events extends SocketEvents<Events> = DefaultEventsMap> {
  close: () => Promise<void>
  port: number
  to: Server<DefaultEventsMap, Events>['to']
}

export const startSocketListener = function startSocketListener<
  Incoming extends SocketEvents<Incoming> = DefaultEventsMap,
  Outgoing extends SocketEvents<Outgoing> = DefaultEventsMap,
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

  const address = tcpAddress.parse(server.httpServer.address())
  return {
    close: async () => {
      await server.close()
    },
    port: address.port,
    to: (room) => server.to(room),
  }
}
