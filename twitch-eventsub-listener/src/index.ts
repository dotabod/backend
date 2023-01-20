import './db/watcher.js'

import { EventSubChannelPollChoice, EventSubChannelPredictionOutcome } from '@twurple/eventsub-base'
import { Server } from 'socket.io'

import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { listener } from './twitch/lib/listener.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'

const accountIds = await getAccountIds()
const io = new Server(5015)

let eventsIOConnected = false
io.on('connection', (socket) => {
  void socket.join('twitch-channel-events')
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

  io.to('twitch-channel-events').emit('event', eventName, data.broadcasterId, {
    choices: data?.choices?.map((choice: EventSubChannelPollChoice) => ({
      totalVotes: choice.totalVotes,
      title: choice.title,
    })),
    title: data?.title,
    endDate: data?.lockDate || data?.endDate,
    outcomes: data?.outcomes?.map((outcome: EventSubChannelPredictionOutcome) => ({
      totalVotes: outcome.channelPoints,
      totalUsers: outcome.users,
      title: outcome.title,
      topUsers: outcome.topPredictors.map((topUser) => ({
        userDisplayName: topUser.userDisplayName,
        channelPointsUsed: topUser.channelPointsUsed,
        channelPointsWon: topUser.channelPointsWon,
      })),
    })),
  })
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

const promises: Promise<any>[] = []
accountIds.forEach((userId) => {
  try {
    promises.push(
      ...events.map((event: string) => {
        try {
          // @ts-expect-error gonna just call strings and hope they exist if we dont update the lib
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return listener[event](userId, (data: any) => handleEvent(event, data))
        } catch (error) {
          console.error({ userId, error })
        }
      }),
    )
  } catch (e) {
    console.log(e)
  }
})

Promise.all(promises)
  .then(() => console.log('done subbing to', accountIds.length, 'channels'))
  .catch((e) => {
    console.log(e)
  })
