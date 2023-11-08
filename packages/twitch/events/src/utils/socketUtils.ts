import { Server } from 'socket.io'

export const socketIo = new Server(5015)

// the socketio hooks onto the listener http server that it creates
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

export const setupSocketIO = () => {
  socketIo.on('connection', async (socket) => {
    console.log('[TWITCHEVENTS] Joining socket to room')
    await socket.join(DOTABOD_EVENTS_ROOM)

    console.log('[TWITCHEVENTS] eventsIOConnected = true')
    eventsIOConnected = true

    socket.on('connect_error', (err) => {
      console.log(`[TWITCHEVENTS] socket connect_error due to ${err.message}`)
    })

    socket.on('disconnect', () => {
      eventsIOConnected = false
    })
  })
}
