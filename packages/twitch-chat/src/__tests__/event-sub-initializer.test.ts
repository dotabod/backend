import { once } from 'node:events'
import { createServer } from 'node:http'

import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createEventSubInitializer } from '../event-sub-initializer.ts'

describe(createEventSubInitializer, () => {
  it('initializes after a reconnect arrives while the original conduit request is still pending', async () => {
    const httpServer = createServer()
    const server = new Server(httpServer)
    const signals = new EventTarget()
    let requests = 0

    server.on('connection', (socket) => {
      socket.on('getConduitData', () => {
        requests += 1
        if (requests === 1) {
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
          await once(signals, 'timeout')
          return
        }
        await once(signals, 'conduitData')
      }
    )

    client.on('conduitData', ({ conduitId }: { conduitId: string }) => {
      activeConduitId = conduitId
      signals.dispatchEvent(new Event('conduitData'))
    })
    client.once('disconnect', () => {
      client.once('connect', () => {
        signals.dispatchEvent(new Event('reconnect'))
      })
    })
    const reconnected = once(signals, 'reconnect')

    try {
      client.connect()
      await reconnected
      expect(attempts).toBe(1)
      signals.dispatchEvent(new Event('timeout'))

      await vi.waitFor(() => {
        expect(activeConduitId).toBe('replacement-conduit')
      })
      expect(requests).toBe(2)
    } finally {
      client.close()
      signals.dispatchEvent(new Event('timeout'))
      await server.close()
    }
  })
})
