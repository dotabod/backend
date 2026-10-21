// Runs socketMatchRequester against a real socket.io server on localhost whose handler
// acks the way packages/steam/src/index.ts does: (error, response).
import { once } from 'node:events'
import { createServer } from 'node:http'

import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { fetchValveMatch, socketMatchRequester } from '../match-verification.ts'
import { valveMatch } from './match-verification-fakes.ts'

type SteamAck = (error: string | null, response: { matches: unknown[] } | null) => void

const httpServer = createServer()
const server = new Server(httpServer)
const steam = { connected: true }

server.on('connection', (socket) => {
  socket.on('getMatchMinimalDetails', (data: { match_id: number }, respond: SteamAck) => {
    if (!steam.connected) {
      respond('Steam not connected', null)
      return
    }
    const known = String(data.match_id) === '9053165578'
    respond(null, {
      matches: known
        ? [{ ...valveMatch(), match_id: { high: 2, low: 463_230_986, unsigned: true } }]
        : [],
    })
  })
})

describe(socketMatchRequester, () => {
  // Emits made before the connection opens are buffered and sent once it does
  const listening = once(httpServer.listen(0, '127.0.0.1'), 'listening')
  let client: Socket = io({ autoConnect: false })

  beforeAll(async () => {
    await listening
    const { port } = z.object({ port: z.number() }).parse(httpServer.address())
    client = io(`http://127.0.0.1:${port}`)
  })

  afterAll(async () => {
    client.close()
    await server.close()
  })

  it('reads the match out of the steam service acknowledgement', async () => {
    await expect(socketMatchRequester(client)('9053165578')).resolves.toMatchObject({
      match_id: '9053165578',
      match_outcome: 3,
    })
  })

  it('returns null when Valve does not have the match', async () => {
    await expect(socketMatchRequester(client)('1')).resolves.toBeNull()
  })

  it('reports the steam service being disconnected as unavailable', async () => {
    steam.connected = false
    await expect(fetchValveMatch(socketMatchRequester(client), '9053165578')).resolves.toBe(
      'unavailable'
    )
    steam.connected = true
  })
})
