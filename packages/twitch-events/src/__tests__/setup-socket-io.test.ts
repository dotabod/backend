import { io as connect } from 'socket.io-client'
import { describe, expect, it, vi } from 'vitest'

import { isEventsIOConnected, setupSocketIO } from './shared-mocks.ts'

describe(setupSocketIO, () => {
  it('answers getConduitData from the first connected client', async () => {
    const onConduitData = vi.fn<(payload: { conduitId: string }) => void>()
    const listener = setupSocketIO(0)
    const client = connect(`http://127.0.0.1:${listener.port}`, {
      reconnection: false,
      transports: ['websocket'],
    })

    try {
      client.on('conduitData', onConduitData)
      client.emit('getConduitData', { forceRefresh: false })
      await vi.waitFor(() => {
        expect(onConduitData).toHaveBeenCalledWith({ conduitId: 'conduit-1' })
      })
      expect(isEventsIOConnected()).toBeTruthy()
    } finally {
      client.close()
      await listener.close()
    }
  })
})
