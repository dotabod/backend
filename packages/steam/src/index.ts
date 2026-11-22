import { startHeartbeat } from '@dotabod/shared-utils'

import { initSpectatorProtobuff } from './init-spectator-protobuff'
import { createSocketServer } from './socket-server.js'
import Dota, { getRealTimeStats } from './steam'
import type { MatchMinimalDetailsResponse } from './types/match-minimal-details'
import { logger } from './utils/logger'

let isConnectedToSteam = false

initSpectatorProtobuff()

// Report liveness to the Uptime Kuma push monitor
startHeartbeat()

// Report whether the connection to the Steam/Dota game coordinator is live (separate monitor)
startHeartbeat({
  debounceMs: 90_000,
  getStatus: () => ({
    msg: isConnectedToSteam ? 'connected' : 'steam gc disconnected',
    up: isConnectedToSteam,
  }),
  name: 'steam gc heartbeat',
  url: process.env.KUMA_PUSH_URL_GC,
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

const getErrorMessage = function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const withTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  const { promise: timeout, reject } = Promise.withResolvers<never>()
  const timer = setTimeout(() => reject(new Error('Operation timed out')), 30_000)
  try {
    return await Promise.race([operation, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const socketIoServer = createSocketServer((socket, server) => {
  const disconnect = () => {
    socket.removeAllListeners()
    socket.disconnect(true)
  }

  try {
    void socket.join('steam')
  } catch (error) {
    logger.error('[STEAM] Could not join steam socket room', { error })
    disconnect()
    return
  }

  socket.on('error', (error) => {
    logger.error('[STEAM] Socket error', { error })
    disconnect()
  })

  socket.on('getVersion', (ack: (commitHash: string | null) => void) => {
    ack(process.env.COMMIT_HASH ?? null)
  })

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
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error('[STEAM] Error getting cards', {
        accountIds,
        error: errorMessage,
        errorAll: error,
        refetchCards,
      })
      callback(errorMessage, null)
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
    } catch (error) {
      callback(getErrorMessage(error), null)
    }
  })

  socket.on('getPlayerSummaries', async (accountIds: number[], callback: callback) => {
    if (!isConnectedToSteam) {
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(dota.getPlayerSummaries(accountIds))
      callback(null, result)
    } catch (error) {
      callback(getErrorMessage(error), null)
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
      logger.info('[STEAM] Got user steam server', { result, steam32Id })
      callback(null, result)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error('[STEAM] Error getting user steam server, unknown error', {
        caughtError: error,
        error: errorMessage,
        steam32Id,
      })
      callback(errorMessage, null)
    }
  })

  socket.on(
    'getRealTimeStats',
    async (data: Parameters<typeof getRealTimeStats>[0], callback: callback) => {
      if (!isConnectedToSteam) {
        callback('Steam not connected', null)
        return
      }
      try {
        const result = await withTimeout(
          getRealTimeStats(data, (match) => {
            server.to('steam').emit('saveHeroesForMatchId', match)
          })
        )
        callback(null, result)
      } catch (error) {
        callback(getErrorMessage(error), null)
      }
    }
  )

  socket.on('getMatchMinimalDetails', async (data: { match_id: number }, callback: callback) => {
    if (!isConnectedToSteam) {
      callback('Steam not connected', null)
      return
    }
    try {
      const response: MatchMinimalDetailsResponse = await withTimeout(
        dota.requestMatchMinimalDetails([data.match_id])
      )
      callback(null, response)
    } catch (error) {
      callback(getErrorMessage(error), null)
    }
  })
})

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('[STEAM] Shutting down', { signal })
  try {
    dota.exit()
    socketIoServer.disconnectSockets(true)
  } finally {
    process.exit(0)
  }
}

process
  .once('SIGTERM', shutdown)
  .once('SIGINT', shutdown)
  .on('uncaughtException', (error) => {
    logger.error('uncaughtException', error)
  })
