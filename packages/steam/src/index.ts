import { initSpectatorProtobuff } from './initSpectatorProtobuff.js'
import { socketIoServer } from './socketServer.js'
import Dota from './steam.js'
import { logger } from './utils/logger.js'
import type { MatchMinimalDetailsResponse } from './types/MatchMinimalDetails.js'

let hasDotabodSocket = false
let isConnectedToSteam = false

initSpectatorProtobuff()

const dota = Dota.getInstance()
dota.dota2.on('ready', () => {
  logger.info('[SERVER] Connected to dota game server')
  isConnectedToSteam = true
})

type callback = (err: any, response: any) => void

socketIoServer.on('connection', (socket) => {
  // dota node app just connected
  // make it join our room
  console.log('Found a connection!')
  try {
    void socket.join('steam')
  } catch (e) {
    console.log('Could not join steam socket')
    return
  }

  hasDotabodSocket = true

  socket.on('disconnect', () => {
    console.log('disconnect')
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })

  socket.on('getCards', async (accountIds: number[], refetchCards: boolean, callback: callback) => {
    if (!isConnectedToSteam) return
    try {
      callback(null, await dota.getCards(accountIds, refetchCards))
    } catch (e: any) {
      callback(e.message, null)
    }
  })

  socket.on('getCard', async (accountId: number, callback: callback) => {
    if (!isConnectedToSteam) return
    try {
      callback(null, await dota.getCard(accountId))
    } catch (e: any) {
      callback(e.message, null)
    }
  })

  socket.on('getUserSteamServer', async (steam32Id: number, callback: callback) => {
    if (!isConnectedToSteam) return
    try {
      callback(null, await dota.getUserSteamServer(steam32Id))
    } catch (e: any) {
      callback(e.message, null)
    }
  })

  socket.on('getRealTimeStats', async (data: any, callback: callback) => {
    if (!isConnectedToSteam) return
    try {
      callback(null, await dota.GetRealTimeStats(data))
    } catch (e: any) {
      callback(e.message, null)
    }
  })

  socket.on('getMatchMinimalDetails', async (matchIds: number[], callback: callback) => {
    if (!isConnectedToSteam) return
    try {
      const response: MatchMinimalDetailsResponse = await dota.requestMatchMinimalDetails(matchIds)
      callback(null, response)
    } catch (e: any) {
      callback(e.message, null)
    }
  })
})

export default socketIoServer
