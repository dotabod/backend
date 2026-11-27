import { startSocketListener } from '@dotabod/shared-utils/start-socket-listener'
import type { SocketListener } from '@dotabod/shared-utils/start-socket-listener'
import type { Socket } from 'socket.io'

let listener: SocketListener | undefined

export const setupSteamSocket = function setupSteamSocket(
  onConnection: (socket: Socket) => void,
  port = 5035
): SocketListener {
  listener = startSocketListener({ onConnection, port })
  return listener
}

export const emitHeroesForMatch = function emitHeroesForMatch(payload: {
  matchId: string
  token: string
}): void {
  listener?.to('steam').emit('saveHeroesForMatchId', payload)
}
