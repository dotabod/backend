import { io as connect } from 'socket.io-client'
import { describe, expect, it } from 'vitest'

import { emitHeroesForMatch, setupSteamSocket } from '../socket-server.ts'

describe(setupSteamSocket, () => {
  it('serves the first Steam client and broadcasts to its room', async () => {
    const listener = setupSteamSocket((socket) => {
      void socket.join('steam')
      socket.on('ping', (payload: string, acknowledge: (reply: string) => void) => {
        acknowledge(`pong:${payload}`)
      })
    }, 0)
    const client = connect(`http://127.0.0.1:${listener.port}`, {
      reconnection: false,
      transports: ['websocket'],
    })

    try {
      await expect(client.timeout(1000).emitWithAck('ping', 'hello')).resolves.toBe('pong:hello')
      const heroes = Promise.withResolvers<{ matchId: string; token: string }>()
      client.once('saveHeroesForMatchId', heroes.resolve)
      const match = { matchId: '42', token: 'token' }
      emitHeroesForMatch(match)
      await expect(heroes.promise).resolves.toStrictEqual(match)
    } finally {
      client.close()
      await listener.close()
    }
  })
})
