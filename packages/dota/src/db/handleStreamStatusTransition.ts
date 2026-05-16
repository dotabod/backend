import type { Server } from 'socket.io'
import type { GSIHandlerType } from '../dota/GSIHandlerTypes.js'
import type { SocketClient } from '../types.js'

type Logger = {
  error: (message: string, meta?: Record<string, unknown>) => void
}

type StreamStatusTransitionResult = {
  changed: boolean
  cameOnline: boolean
  wentOffline: boolean
}

export function handleStreamStatusTransition({
  client,
  connectedUser,
  io,
  logger,
  oldStreamOnline,
}: {
  client: Pick<SocketClient, 'name' | 'stream_online' | 'token'>
  connectedUser?: Pick<GSIHandlerType, 'enable'> | null
  io: Pick<Server, 'to'>
  logger: Logger
  oldStreamOnline: boolean
}): StreamStatusTransitionResult {
  const changed = client.stream_online !== oldStreamOnline
  if (!changed) {
    return { changed: false, cameOnline: false, wentOffline: false }
  }

  // Horizontal dota scaling needs a shared Socket.IO adapter or sticky single process routing.
  io.to(client.token).emit('refresh-settings', 'mutate')

  if (client.stream_online) {
    try {
      connectedUser?.enable()
    } catch (e) {
      logger.error('[WATCHER USER] Error enabling GSI handler after stream came online', {
        e,
        name: client.name,
        token: client.token,
      })
    }
  }

  return {
    changed: true,
    cameOnline: client.stream_online,
    wentOffline: !client.stream_online,
  }
}
