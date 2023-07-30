import { Server } from 'socket.io'

export const io = new Server(5015)
export const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'
export let eventsIOConnected = false

io.on('connection', (socket) => {
  try {
    void socket.join(DOTABOD_EVENTS_ROOM)
  } catch (e) {
    console.error('could not join socket DOTABOD_EVENTS_ROOM', e)
    return
  }

  eventsIOConnected = true

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})
