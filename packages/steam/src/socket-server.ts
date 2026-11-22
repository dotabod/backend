import { startSocketListener } from '@dotabod/shared-utils/start-socket-listener'
import type { SocketListener } from '@dotabod/shared-utils/start-socket-listener'
import type { Socket } from 'socket.io'

let listener: SocketListener | undefined

export function setupSteamSocket(
  onConnection: (socket: Socket) => void,
  port = 5035
): SocketListener {
  listener = startSocketListener({ onConnection, port })
  return listener
}

export function emitHeroesForMatch(payload: { matchId: string; token: string }): void {
  listener?.to('steam').emit('saveHeroesForMatchId', payload)
}
