import type { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createSocketServer } from '../socket-server'

interface ClientToServerEvents {
  ping: (payload: string, acknowledge: (reply: string) => void) => void
}

interface ServerToClientEvents {
  serverReady: () => void
}

const server: Server<ClientToServerEvents, ServerToClientEvents> = createSocketServer(0)
const addressResult = z.object({ port: z.number() }).safeParse(server.httpServer.address())
if (!addressResult.success) {
  throw new Error('Socket test server did not bind to a TCP port')
}
const { port } = addressResult.data

describe('createSocketServer round-trip', () => {
  afterAll(async () => {
    server.disconnectSockets(true)
    await server.close()
  }, 10_000)

  it('accepts a client connection and echoes an event', async () => {
    server.on('connection', (socket) => {
      socket.on('ping', (payload, acknowledge) => {
        acknowledge(`pong:${payload}`)
      })
    })

    const client: Socket<ServerToClientEvents, ClientToServerEvents> = ioClient(
      `http://127.0.0.1:${port}`,
      {
        reconnection: false,
        transports: ['websocket'],
      }
    )
    try {
      const reply = await client.emitWithAck('ping', 'hello')
      expect(reply).toBe('pong:hello')
    } finally {
      client.disconnect()
    }
  })
})
