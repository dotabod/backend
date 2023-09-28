import { Server } from 'socket.io'

import Dota from './steam.js'
import { logger } from './utils/logger.js'

let hasDotabodSocket = false
let isConnectedToSteam = false

const io = new Server(5037)
const dota = Dota.getInstance()

dota.dota2.on('ready', () => {
  logger.info('[SERVER] Connected to dota game coordinator')
  isConnectedToSteam = true
})

interface callback {
  (err: any, response: any): void
}

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
    console.log('disconnect')
    console.log('We lost the server! Respond to all messages with "server offline"')
    hasDotabodSocket = false
  })

  socket.on('getCards', async function (accountIds: number[], callback: callback) {
    if (!isConnectedToSteam) return
    try {
      callback(null, await dota.getCards(accountIds))
    } catch (e: any) {
      callback(e.message, null)
    }
  })
})

export default io
