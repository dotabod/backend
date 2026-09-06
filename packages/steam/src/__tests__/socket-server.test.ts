import type { AddressInfo, Server as HttpServer } from 'node:net'

import { io as ioClient } from 'socket.io-client'
import { afterAll, describe, expect, it } from 'vitest'

import { createSocketServer } from '../socket-server'

const server = createSocketServer(0)
const httpServer = server.httpServer as HttpServer & {
  closeAllConnections?: () => void
}
const { port } = httpServer.address() as AddressInfo

afterAll(async () => {
  server.disconnectSockets(true)
  await new Promise<void>((resolve) => {
    void server.close(() => {
      resolve()
    })
    httpServer.closeAllConnections?.()
  })
}, 10_000)

describe('createSocketServer round-trip', () => {
  it('accepts a client connection and echoes an event', async () => {
    server.on('connection', (sock) => {
      sock.on('ping', (payload, ack) => ack(`pong:${payload}`))
    })

    const client = ioClient(`http://127.0.0.1:${port}`, {
      reconnection: false,
      transports: ['websocket'],
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('connect timeout'))
        }, 5000)
        client.on('connect', () => {
          clearTimeout(timer)
          resolve()
        })
        client.on('connect_error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
      })

      const reply = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('ack timeout'))
        }, 5000)
        client.emit('ping', 'hello', (msg: string) => {
          clearTimeout(timer)
          resolve(msg)
        })
      })
      expect(reply).toBe('pong:hello')
    } finally {
      client.disconnect()
    }
  })
})
