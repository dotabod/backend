import type { Socket } from 'socket.io'
import { initSpectatorProtobuff } from './initSpectatorProtobuff.js'
import { socketIoServer } from './socketServer.js'
import Dota, { GetRealTimeStats } from './steam.js'
import type { MatchMinimalDetailsResponse } from './types/MatchMinimalDetails.js'
import { logger } from './utils/logger.js'

let hasDotabodSocket = false
let isConnectedToSteam = false

initSpectatorProtobuff()

const dota = Dota.getInstance()
dota.dota2.on('ready', () => {
  logger.info('[SERVER] Connected to dota game server')
  isConnectedToSteam = true
})
dota.dota2.on('unready', () => {
  logger.info('[SERVER] Disconnected from dota game server')
  isConnectedToSteam = false
})

type callback = (err: any, response: any) => void

// Store active sockets with cleanup capability
const activeSockets = new Set()

socketIoServer.on('connection', (socket) => {
  console.log('Found a connection!')

  activeSockets.add(socket)

  // Cleanup function
  const cleanupSocket = (sock: Socket) => {
    activeSockets.delete(sock)
    hasDotabodSocket = activeSockets.size > 0
    sock.removeAllListeners()
    sock.disconnect(true)
  }

  try {
    void socket.join('steam')
    hasDotabodSocket = true
  } catch (e) {
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
  const withTimeout = (fn: Promise<any>, timeoutMs = 30000) => {
    return Promise.race([
      fn,
      new Promise((_, reject) =>
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
    } catch (e: any) {
      logger.error('[STEAM] Error getting cards', {
        accountIds,
        refetchCards,
        errorAll: e,
        error: e.message,
      })
      callback(e.message, null)
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
    } catch (e: any) {
      callback(e.message, null)
    }
  })

  socket.on('getUserSteamServer', async (steam32Id: number, callback: callback) => {
    if (!isConnectedToSteam) {
      logger.error('[STEAM] Error getting user steam server, not connected to steam', { steam32Id })
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(dota.getUserSteamServer(steam32Id))
      logger.info('[STEAM] Got user steam server', { steam32Id, result })
      callback(null, result)
    } catch (e: any) {
      logger.error('[STEAM] Error getting user steam server, unknown error', {
        steam32Id,
        e,
        error: e.message,
      })
      callback(e.message, null)
    }
  })

  socket.on('getRealTimeStats', async (data: any, callback: callback) => {
    if (!isConnectedToSteam) {
      callback('Steam not connected', null)
      return
    }
    try {
      const result = await withTimeout(GetRealTimeStats(data))
      callback(null, result)
    } catch (e: any) {
      callback(e.message, null)
    }
  })

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
    } catch (e: any) {
      callback(e.message, null)
    }
  })
})

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  activeSockets.forEach((socket: any) => {
    socket.disconnect(true)
  })
  socketIoServer.close()
  process.exit(0)
})

process.on('SIGINT', () => {
  activeSockets.forEach((socket: any) => {
    socket.disconnect(true)
  })
  socketIoServer.close()
  process.exit(0)
})

export default socketIoServer
