import type { Socket } from 'socket.io-client'

export const createEventSubInitializer = function createEventSubInitializer(
  eventsSocket: Pick<Socket, 'connected' | 'on'>,
  isEventSubConnected: () => boolean,
  initialize: (reason: string) => Promise<void>
): (reason: string) => Promise<void> {
  let running = false
  let reconnectPending = false

  const ensureInitialized = async (reason: string): Promise<void> => {
    if (running || !eventsSocket.connected || isEventSubConnected()) {
      return
    }

    running = true
    try {
      await initialize(reason)
    } finally {
      running = false
      if (reconnectPending) {
        reconnectPending = false
        await ensureInitialized('eventsSocket connect')
      }
    }
  }

  eventsSocket.on('connect', () => {
    if (running) {
      reconnectPending = true
      return
    }
    void ensureInitialized('eventsSocket connect')
  })

  return ensureInitialized
}
