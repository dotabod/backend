process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

import { startHeartbeat } from '@dotabod/shared-utils'
import type { Socket } from 'socket.io'
import { initSpectatorProtobuff } from './initSpectatorProtobuff'
import { getSocketIoServer } from './socketServer'
import Dota, { GetRealTimeStats } from './steam'
import type { MatchMinimalDetailsResponse } from './types/MatchMinimalDetails'
import { logger } from './utils/logger'

let _hasDotabodSocket = false
let isConnectedToSteam = false

initSpectatorProtobuff()

const socketIoServer = getSocketIoServer()

// Report liveness to the Uptime Kuma push monitor
startHeartbeat()

// Report whether the connection to the Steam/Dota game coordinator is live (separate monitor)
startHeartbeat({
  url: process.env.KUMA_PUSH_URL_GC,
  name: 'steam gc heartbeat',
  debounceMs: 90_000,
  getStatus: () => ({
    up: isConnectedToSteam,
    msg: isConnectedToSteam ? 'connected' : 'steam gc disconnected',
  }),
})

const dota = Dota.getInstance()
dota.dota2.on('ready', () => {
  logger.info('[SERVER] Connected to dota game server')
  isConnectedToSteam = true
})
dota.dota2.on('unready', () => {
  logger.info('[SERVER] Disconnected from dota game server')
  isConnectedToSteam = false
})

type callback = (err: string | null, response: unknown) => void

// Store active sockets with cleanup capability
const activeSockets = new Set()

socketIoServer.on('connection', (socket) => {
  console.log('Found a connection!')

  activeSockets.add(socket)

  // Cleanup function
  const cleanupSocket = (sock: Socket) => {
    activeSockets.delete(sock)
    _hasDotabodSocket = activeSockets.size > 0
    sock.removeAllListeners()
    sock.disconnect(true)
  }

  try {
    void socket.join('steam')
    _hasDotabodSocket = true
  } catch (_e) {
    console.log('Could not join steam socket')
    cleanupSocket(socket)
    return
  }

  socket.on('disconnect', () => {
    console.log('disconnect')
    console.log('We lost the server! Respond to all messages with "server offline"')
    cleanupSocket(socket)
  })

  socket.on('error', (error) => {
    console.error('Socket error:', error)
    cleanupSocket(socket)
  })

  // Add timeout for long-running operations (e.g., 30 seconds)
  const withTimeout = <T>(fn: Promise<T>, timeoutMs = 30000): Promise<T> => {
    return Promise.race([
      fn,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs),
      ),
    ])
  }

  socket.on('getCards', async (accountIds: number[], refetchCards: boolean, callback: callback) => {
    if (!isConnectedToSteam) {
      logger.error('[STEAM] Error getting cards, not connected to steam', {
        accountIds,
        refetchCards,
      })
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(dota.getCards(accountIds, refetchCards))
      callback(null, result)
    } catch (e) {
      logger.error('[STEAM] Error getting cards', {
        accountIds,
        refetchCards,
        errorAll: e,
        error: (e as Error).message,
      })
      callback((e as Error).message, null)
    }
  })

  socket.on('getCard', async (accountId: number, callback: callback) => {
    if (!isConnectedToSteam) {
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(dota.getCard(accountId))
      callback(null, result)
    } catch (e) {
      callback((e as Error).message, null)
    }
  })

  // PRESERVED — gated, not dead. Caller (dota's saveMatchData) is behind ENABLE_SPECTATE_FRIEND_GAME.
  // See memory `keep-spectate-friend-path`. Re-enable + test once bot-friend management exists.
  socket.on('getUserSteamServer', async (steam32Id: number, callback: callback) => {
    if (!isConnectedToSteam) {
      logger.error('[STEAM] Error getting user steam server, not connected to steam', {
        steam32Id,
      })
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(dota.getUserSteamServer(steam32Id))
      logger.info('[STEAM] Got user steam server', { steam32Id, result })
      callback(null, result)
    } catch (e) {
      logger.error('[STEAM] Error getting user steam server, unknown error', {
        steam32Id,
        e,
        error: (e as Error).message,
      })
      callback((e as Error).message, null)
    }
  })

  socket.on(
    'getRealTimeStats',
    async (data: Parameters<typeof GetRealTimeStats>[0], callback: callback) => {
      if (!isConnectedToSteam) {
        callback('Steam not connected', null)
        return
      }
      try {
        const result = await withTimeout(GetRealTimeStats(data))
        callback(null, result)
      } catch (e) {
        callback((e as Error).message, null)
      }
    },
  )

  socket.on('getMatchMinimalDetails', async (data: { match_id: number }, callback: callback) => {
    if (!isConnectedToSteam) {
      callback('Steam not connected', null)
      return
    }
    try {
      const response: MatchMinimalDetailsResponse = await withTimeout(
        dota.requestMatchMinimalDetails([data.match_id]),
      )
      callback(null, response)
    } catch (e) {
      callback((e as Error).message, null)
    }
  })
})

export default socketIoServer
