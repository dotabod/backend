import { describe, expect, it } from 'vite-plus/test'
import net from 'node:net'

// The node-steam Connection class extends net.Socket via util.inherits and uses
// the 'readable' event + this.read(n) to parse Steam's framed packets
// (uint32LE length + "VT01" magic + body). This is the API surface bun has
// historically lagged on, so we exercise it end-to-end against a local TCP
// server. If bun ever regresses, this test will catch it.
//
// Regression guard for oven-sh/bun#6080 ("Readable.prototype is undefined") —
// reproduces under bun 1.0.3 and 1.1.8, fixed by 1.2.8.

// @ts-expect-error no types
const Connection = require('steam/lib/connection') as new () => net.Socket & {
  on(event: 'packet', listener: (body: Buffer) => void): unknown
  on(event: string | symbol, listener: (...args: unknown[]) => void): unknown
  connect(port: number, host: string): unknown
  end(): unknown
}

function frame(body: Buffer): Buffer {
  const buf = Buffer.alloc(4 + 4 + body.length)
  buf.writeUInt32LE(body.length, 0)
  buf.write('VT01', 4)
  body.copy(buf, 8)
  return buf
}

describe('node-steam Connection readable-stream parsing under bun', () => {
  it('emits a packet event with the framed body in a single write', async () => {
    const body = Buffer.from('hello-from-server')
    const server = net.createServer((sock) => {
      sock.write(frame(body))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port

    try {
      const conn = new Connection()
      const got = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no packet event')), 5000)
        conn.on('packet', (packet: Buffer) => {
          clearTimeout(timer)
          resolve(packet)
        })
        conn.on('error', (err: unknown) => {
          clearTimeout(timer)
          reject(err as Error)
        })
        conn.connect(port, '127.0.0.1')
      })
      expect(got.toString()).toBe(body.toString())
      conn.end()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reassembles multiple packets arriving in a single TCP chunk', async () => {
    const a = Buffer.from('packet-a')
    const b = Buffer.from('packet-b-longer')
    const server = net.createServer((sock) => {
      sock.write(Buffer.concat([frame(a), frame(b)]))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port

    try {
      const conn = new Connection()
      const got = await new Promise<Buffer[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('did not get both packets')), 5000)
        const received: Buffer[] = []
        conn.on('packet', (packet: Buffer) => {
          received.push(packet)
          if (received.length === 2) {
            clearTimeout(timer)
            resolve(received)
          }
        })
        conn.on('error', (err: unknown) => {
          clearTimeout(timer)
          reject(err as Error)
        })
        conn.connect(port, '127.0.0.1')
      })
      expect(got[0].toString()).toBe(a.toString())
      expect(got[1].toString()).toBe(b.toString())
      conn.end()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reassembles a packet split across multiple TCP writes', async () => {
    const body = Buffer.from('split-across-writes')
    const framed = frame(body)
    const server = net.createServer((sock) => {
      // Send the 8-byte header first, then the body after a tick, so the
      // Connection has to wait on a second 'readable' event.
      sock.write(framed.subarray(0, 8))
      setTimeout(() => sock.write(framed.subarray(8)), 20)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port

    try {
      const conn = new Connection()
      const got = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no packet event after split write')), 5000)
        conn.on('packet', (packet: Buffer) => {
          clearTimeout(timer)
          resolve(packet)
        })
        conn.on('error', (err: unknown) => {
          clearTimeout(timer)
          reject(err as Error)
        })
        conn.connect(port, '127.0.0.1')
      })
      expect(got.toString()).toBe(body.toString())
      conn.end()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
