import { Server } from 'socket.io'

import Dota from './steam.js'
import { logger } from './utils/logger.js'

let hasDotabodSocket = false
let isConnectedToSteam = false

const io = new Server(5035)
const dota = Dota.getInstance()

dota.dota2.on('ready', () => {
  logger.info('[SERVER] Connected to dota game coordinator')
  isConnectedToSteam = true
})

io.on('connection', (socket) => {
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
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })

  socket.on('getCards', async function (accountIds: number[]) {
    if (!isConnectedToSteam) return
    return await dota.getCards(accountIds)
  })

  socket.on('getCard', async function (accountId: number) {
    if (!isConnectedToSteam) return
    return await dota.getCard(accountId)
  })

  socket.on('getUserSteamServer', async function (steam32Id: number) {
    if (!isConnectedToSteam) return
    return await dota.getUserSteamServer(steam32Id)
  })

  socket.on('getRealTimeStats', async function (data: any) {
    if (!isConnectedToSteam) return
    return await dota.GetRealTimeStats(data)
  })
})

export default io
