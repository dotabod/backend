import './db/watcher.js'

import { Server } from 'socket.io'

import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { listener } from './twitch/lib/listener.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'

const accountIds = await getAccountIds()
const io = new Server(5015)

let eventsIOConnected = false
io.on('connection', (socket) => {
  void socket.join('twitch-chat-events')
  eventsIOConnected = true

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})

function handleEvent(eventName: string, data: any) {
  if (!eventsIOConnected) {
    return
  }

  if (events[0] === eventName) {
    onlineEvent(data)
    return
  }
  if (events[1] === eventName) {
    offlineEvent(data)
    return
  }

  io.to('twitch-chat-events').emit(eventName, data.broadcasterId, data)
}

const events = [
  'subscribeToStreamOnlineEvents',
  'subscribeToStreamOfflineEvents',
  'subscribeToChannelPredictionBeginEvents',
  'subscribeToChannelPredictionProgressEvents',
  'subscribeToChannelPredictionLockEvents',
  'subscribeToChannelPredictionEndEvents',
  'subscribeToChannelPollBeginEvents',
  'subscribeToChannelPollProgressEvents',
  'subscribeToChannelPollEndEvents',
]

accountIds.map((userId) => {
  return Promise.all(
    events.map((event) => listener[event](userId, (data: any) => handleEvent(event, data))),
  )
})
