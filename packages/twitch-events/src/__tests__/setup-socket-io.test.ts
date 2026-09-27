import { io as connect } from 'socket.io-client'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { isEventsIOConnected, setupSocketIO, socketIo } from './shared-mocks.ts'

const PORT = 15_015

describe(setupSocketIO, () => {
  afterAll(async () => {
    await socketIo.close()
  })

  // Prod 2026-09-27: twitch-chat connected before the connection handler was attached,
  // and its getConduitData requests went unanswered until twitch-chat was restarted.
  it('answers getConduitData from a client that connects the moment the port opens', async () => {
    const onConduitData = vi.fn<(payload: { conduitId: string }) => void>()
    setupSocketIO(PORT)

    const client = connect(`http://localhost:${PORT}`, { transports: ['websocket'] })
    client.on('conduitData', onConduitData)
    client.emit('getConduitData', { forceRefresh: false })

    await vi.waitFor(() => {
      expect(onConduitData).toHaveBeenCalledWith({ conduitId: 'conduit-1' })
    })
    expect(isEventsIOConnected()).toBeTruthy()
    client.close()
  })
})
