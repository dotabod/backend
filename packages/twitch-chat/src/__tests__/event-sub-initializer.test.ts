import { once } from 'node:events'
import { createServer } from 'node:http'

import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createEventSubInitializer } from '../event-sub-initializer.ts'

it('initializes after a reconnect arrives while the original conduit request is still pending', async () => {
  const httpServer = createServer()
  const server = new Server(httpServer)
  const firstRequest = Promise.withResolvers<void>()
  const firstRequestTimedOut = Promise.withResolvers<void>()
  const reconnected = Promise.withResolvers<void>()
  let requests = 0

  server.on('connection', (socket) => {
    socket.on('getConduitData', () => {
      requests += 1
      if (requests === 1) {
        firstRequest.resolve()
        socket.conn.close()
        return
      }
      socket.emit('conduitData', { conduitId: 'replacement-conduit' })
    })
  })
  await once(httpServer.listen(0, '127.0.0.1'), 'listening')
  const { port } = z.object({ port: z.number() }).parse(httpServer.address())
  const client = io(`http://127.0.0.1:${port}`, {
    autoConnect: false,
    reconnectionDelay: 10,
    transports: ['websocket'],
  })

  let activeConduitId: string | undefined
  let attempts = 0
  createEventSubInitializer(
    client,
    () => activeConduitId !== undefined,
    async () => {
      attempts += 1
      client.emit('getConduitData')
      if (attempts === 1) {
        await firstRequestTimedOut.promise
        return
      }
      activeConduitId = await new Promise<string>((resolve) => {
        client.once('conduitData', ({ conduitId }: { conduitId: string }) => resolve(conduitId))
      })
    }
  )

  client.once('disconnect', () => {
    client.once('connect', reconnected.resolve)
  })

  try {
    client.connect()
    await firstRequest.promise
    await reconnected.promise
    expect(attempts).toBe(1)
    firstRequestTimedOut.resolve()

    await vi.waitFor(() => expect(activeConduitId).toBe('replacement-conduit'))
    expect(requests).toBe(2)
  } finally {
    firstRequestTimedOut.resolve()
    client.close()
    await server.close()
  }
})
