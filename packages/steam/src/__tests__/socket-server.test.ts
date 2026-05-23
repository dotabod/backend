import { afterAll, describe, expect, it } from 'vite-plus/test'
import type { AddressInfo } from 'node:net'
import { io as ioClient } from 'socket.io-client'
import { createSocketServer } from '../socketServer'

const server = createSocketServer(0)
const httpServer = server.httpServer!
const port = (httpServer.address() as AddressInfo).port

afterAll(async () => {
  server.disconnectSockets(true)
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    httpServer.closeAllConnections?.()
  })
}, 10_000)

describe('createSocketServer round-trip', () => {
  it('accepts a client connection and echoes an event', async () => {
    server.on('connection', (sock) => {
      sock.on('ping', (payload, ack) => ack(`pong:${payload}`))
    })

    const client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('connect timeout')), 5000)
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
        const timer = setTimeout(() => reject(new Error('ack timeout')), 5000)
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
