import { io as connect } from 'socket.io-client'
import { describe, expect, it, vi } from 'vitest'

import { hasDotabodSocket, setupSocketServer } from '../utils/socket-manager.ts'

describe(setupSocketServer, () => {
  it('hands the first connected client to its chat handlers', async () => {
    const onSay = vi.fn<(providerAccountId: string, text: string) => void>()
    const listener = setupSocketServer((socket) => {
      socket.on('say', onSay)
    }, 0)
    const client = connect(`http://127.0.0.1:${listener.port}`, {
      reconnection: false,
      transports: ['websocket'],
    })

    try {
      client.emit('say', '123', 'hello')
      await vi.waitFor(() => {
        expect(onSay).toHaveBeenCalledWith('123', 'hello')
      })
      expect(hasDotabodSocket()).toBeTruthy()
    } finally {
      client.close()
      await listener.close()
    }
  })
})
