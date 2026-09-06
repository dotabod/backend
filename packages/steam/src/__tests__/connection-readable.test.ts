import { on, once } from 'node:events'
import { createRequire } from 'node:module'
import net from 'node:net'

import { describe, expect, it } from 'vitest'

// The legacy node-steam connection parses uint32LE length + "VT01" magic
// frames through net.Socket's readable event. This guards the bun readable
// stream regression tracked as oven-sh/bun#6080.

const PACKET_TIMEOUT_MS = 5000
const loadCommonJsModule = createRequire(import.meta.url)
const steamConnectionConstructor: unknown = loadCommonJsModule('steam/lib/connection')

type UnknownConstructor = new () => object

const isConstructor = function isConstructor(value: unknown): value is UnknownConstructor {
  return Object.prototype.toString.call(value) === '[object Function]'
}

if (!isConstructor(steamConnectionConstructor)) {
  throw new TypeError('Expected steam/lib/connection to export a constructor')
}

interface ListeningServer {
  port: number
  server: net.Server
}

const frame = function frame(body: Buffer): Buffer {
  const framedPacket = Buffer.alloc(8 + body.length)
  framedPacket.writeUInt32LE(body.length, 0)
  framedPacket.write('VT01', 4)
  body.copy(framedPacket, 8)
  return framedPacket
}

const startServer = async function startServer(
  writePackets: (socket: net.Socket) => void
): Promise<ListeningServer> {
  const server = net.createServer(writePackets)
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening

  const address = server.address()
  if (!(address instanceof Object) || !('port' in address)) {
    server.close()
    throw new Error('Expected the test server to listen on a TCP port')
  }

  return { port: address.port, server }
}

const closeServer = async function closeServer(server: net.Server): Promise<void> {
  const closed = once(server, 'close')
  server.close()
  await closed
}

const createSteamConnection = function createSteamConnection(): net.Socket {
  const connection: unknown = Reflect.construct(steamConnectionConstructor, [])
  if (!(connection instanceof net.Socket)) {
    throw new TypeError('Expected steam/lib/connection to construct a net.Socket')
  }
  return connection
}

const readPackets = async function readPackets(
  port: number,
  packetCount: number,
  timeoutMessage: string
): Promise<Buffer[]> {
  const connection = createSteamConnection()
  const receivedPackets: Buffer[] = []
  const timeoutSignal = AbortSignal.timeout(PACKET_TIMEOUT_MS)
  const packetEvents = on(connection, 'packet', { signal: timeoutSignal })
  connection.connect(port, '127.0.0.1')

  try {
    for await (const packetEvent of packetEvents) {
      const packetValues: unknown[] = packetEvent
      const [packet] = packetValues
      if (!Buffer.isBuffer(packet)) {
        throw new TypeError('node-steam emitted a packet that was not a Buffer')
      }
      receivedPackets.push(packet)
      if (receivedPackets.length === packetCount) {
        return receivedPackets
      }
    }
    throw new Error('node-steam stopped emitting packets')
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(timeoutMessage, { cause: error })
    }
    throw error instanceof Error ? error : new Error('Failed to read node-steam packets')
  } finally {
    connection.end()
  }
}

describe('node-steam Connection readable-stream parsing under bun', () => {
  it('emits a packet event with the framed body in a single write', async () => {
    const body = Buffer.from('hello-from-server')
    const { port, server } = await startServer((socket) => {
      socket.write(frame(body))
    })

    try {
      await expect(readPackets(port, 1, 'no packet event')).resolves.toStrictEqual([body])
    } finally {
      await closeServer(server)
    }
  })

  it('reassembles multiple packets arriving in a single TCP chunk', async () => {
    const firstPacket = Buffer.from('packet-a')
    const secondPacket = Buffer.from('packet-b-longer')
    const { port, server } = await startServer((socket) => {
      socket.write(Buffer.concat([frame(firstPacket), frame(secondPacket)]))
    })

    try {
      await expect(readPackets(port, 2, 'did not get both packets')).resolves.toStrictEqual([
        firstPacket,
        secondPacket,
      ])
    } finally {
      await closeServer(server)
    }
  })

  it('reassembles a packet split across multiple TCP writes', async () => {
    const body = Buffer.from('split-across-writes')
    const framedPacket = frame(body)
    const { port, server } = await startServer((socket) => {
      socket.write(framedPacket.subarray(0, 8))
      setTimeout(() => {
        socket.write(framedPacket.subarray(8))
      }, 20)
    })

    try {
      await expect(
        readPackets(port, 1, 'no packet event after split write')
      ).resolves.toStrictEqual([body])
    } finally {
      await closeServer(server)
    }
  })
})
