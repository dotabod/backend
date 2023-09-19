import http from 'http'

import express from 'express'
import { Server as SocketServer } from 'socket.io'

const socketApp = express()
const server = http.createServer(socketApp)
export const socketIo = new SocketServer(server)

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

export const setupSocketIO = () => {
  socketIo.on('connection', async (socket) => {
    console.log('Joining socket')
    await socket.join(DOTABOD_EVENTS_ROOM)

    console.log('eventsIOConnected = true')
    eventsIOConnected = true

    socket.on('connect_error', (err) => {
      console.log(`connect_error due to ${err.message}`)
    })

    socket.on('disconnect', () => {
      eventsIOConnected = false
    })
  })

  socketApp.listen(5015, () => {
    console.log('[TWITCHEVENTS] Socket Listening on port 5015')
  })
}
