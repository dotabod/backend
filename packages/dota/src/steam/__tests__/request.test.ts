import { once } from 'node:events'
import { createServer } from 'node:http'

import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { requestSteam } from '../request.ts'
import { steamSocket } from '../ws.ts'

type SteamAck = (error: string | null, data: { matches: { match_id: number }[] } | null) => void

// Acks the way packages/steam/src/index.ts does: (error, data). Match 0 fails on Steam's
// side, and match -1 never acks.
const httpServer = createServer()
const steamServer = new Server(httpServer)
steamServer.on('connection', (socket) => {
  socket.on('getMatchMinimalDetails', ({ match_id }: { match_id: number }, respond: SteamAck) => {
    if (match_id === 0) {
      respond('Steam not connected', null)
      return
    }
    if (match_id > 0) {
      respond(null, { matches: [{ match_id }] })
    }
  })
})
await once(httpServer.listen(0, '127.0.0.1'), 'listening')
const { port } = z.object({ port: z.number() }).parse(httpServer.address())
const steamClient = io(`http://127.0.0.1:${port}`)
Object.assign(steamSocket, { timeout: (ms: number) => steamClient.timeout(ms) })

const matchesSchema = z.object({ matches: z.array(z.object({ match_id: z.number() })) })

describe(requestSteam, () => {
  afterAll(async () => {
    steamClient.close()
    await steamServer.close()
  })

  it('resolves with the data the steam service acks after its null error', async () => {
    await expect(
      requestSteam('getMatchMinimalDetails', [{ match_id: 42 }], matchesSchema, 1000)
    ).resolves.toStrictEqual({ matches: [{ match_id: 42 }] })
  })

  it('rejects with the error the steam service acks', async () => {
    await expect(
      requestSteam('getMatchMinimalDetails', [{ match_id: 0 }], matchesSchema, 1000)
    ).rejects.toThrow('Steam not connected')
  })

  it('rejects when the steam service never acks', async () => {
    await expect(
      requestSteam('getMatchMinimalDetails', [{ match_id: -1 }], matchesSchema, 50)
    ).rejects.toThrow('operation has timed out')
  })
})
