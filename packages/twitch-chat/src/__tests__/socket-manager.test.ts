import { io as connect } from 'socket.io-client'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { hasDotabodSocket, io, setupSocketServer } from '../utils/socket-manager.ts'

const PORT = 15_005

describe(setupSocketServer, () => {
  afterAll(async () => {
    await io.close()
  })

  // Prod 2026-09-26: dota reconnected 0.26s after a twitch-chat restart, before the
  // connection handlers were attached, and every command went unanswered for 22h.
  it('hands a client that connects the moment the port opens to its handlers', async () => {
    const onSay = vi.fn<(providerAccountId: string, text: string) => void>()
    setupSocketServer((socket) => {
      socket.on('say', onSay)
    }, PORT)

    const client = connect(`http://localhost:${PORT}`, { transports: ['websocket'] })
    client.emit('say', '123', 'hello')

    await vi.waitFor(() => {
      expect(onSay).toHaveBeenCalledWith('123', 'hello')
    })
    expect(hasDotabodSocket()).toBeTruthy()
    client.close()
  })
})
