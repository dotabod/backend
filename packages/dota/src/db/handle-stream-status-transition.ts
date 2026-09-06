import type { Server } from 'socket.io'

import type { GSIHandlerType } from '../dota/gsi-handler-types'
import { GSI_STALE_AFTER_MS } from '../dota/lib/get-current-match-id'
import type { SocketClient } from '../types'

interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void
}

interface StreamStatusTransitionResult {
  changed: boolean
  cameOnline: boolean
  wentOffline: boolean
}

export const handleStreamStatusTransition = function handleStreamStatusTransition({
  client,
  connectedUser,
  io,
  logger,
  oldStreamOnline,
}: {
  client: Pick<
    SocketClient,
    | 'gsi'
    | 'gsiUpdatedAt'
    | 'name'
    | 'pendingGsi'
    | 'pendingGsiUpdatedAt'
    | 'stream_online'
    | 'token'
  >
  connectedUser?: Partial<Pick<GSIHandlerType, 'disable' | 'enable'>> | null
  io: Pick<Server, 'to'>
  logger: Logger
  oldStreamOnline: boolean
}): StreamStatusTransitionResult {
  const changed = client.stream_online !== oldStreamOnline
  if (!changed) {
    return { cameOnline: false, changed: false, wentOffline: false }
  }

  if (client.stream_online) {
    if (
      client.pendingGsi &&
      client.pendingGsiUpdatedAt &&
      Date.now() - client.pendingGsiUpdatedAt <= GSI_STALE_AFTER_MS
    ) {
      client.gsi = client.pendingGsi
      client.gsiUpdatedAt = client.pendingGsiUpdatedAt
    }
    client.pendingGsi = undefined
    client.pendingGsiUpdatedAt = undefined

    try {
      connectedUser?.enable?.()
    } catch (error) {
      logger.error('[WATCHER USER] Error enabling GSI handler after stream came online', {
        error,
        name: client.name,
        token: client.token,
      })
    }
  } else {
    // Never leave a finished match visible after an offline transition. Incoming offline GSI
    // packets may buffer a newer snapshot, but handlers stay disabled until the stream is live.
    client.gsi = undefined
    client.gsiUpdatedAt = undefined
    try {
      connectedUser?.disable?.()
    } catch (error) {
      logger.error('[WATCHER USER] Error disabling GSI handler after stream went offline', {
        error,
        name: client.name,
        token: client.token,
      })
    }
  }

  // Horizontal dota scaling needs a shared Socket.IO adapter or sticky single process routing.
  io.to(client.token).emit('refresh-settings', 'mutate')

  return {
    cameOnline: client.stream_online,
    changed: true,
    wentOffline: !client.stream_online,
  }
}
