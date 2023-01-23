import './db/watcher.js'

import {
  EventSubChannelPollChoice,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionProgressEvent,
  EventSubUserAuthorizationRevokeEvent,
} from '@twurple/eventsub-base'
import { EventSubHttpListener } from '@twurple/eventsub-http'
import { Server } from 'socket.io'

import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { listener } from './twitch/lib/listener.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'

const io = new Server(5015)
const DOTABOD_EVENTS_ROOM = 'twitch-channel-events'

let eventsIOConnected = false
io.on('connection', (socket) => {
  void socket.join(DOTABOD_EVENTS_ROOM)
  eventsIOConnected = true

  socket.on('disconnect', () => {
    eventsIOConnected = false
  })
})

type EventSubHttpListenerKey = keyof EventSubHttpListener

interface Event {
  customHandler?: (data: any) => void
  sendToSocket?: (data: any) => void
}

const transformPollData = (data: EventSubChannelPollProgressEvent) => ({
  choices: data.choices.map((choice: EventSubChannelPollChoice) => ({
    totalVotes: choice.totalVotes,
    title: choice.title,
  })),
  title: data.title,
  endDate: data.endDate,
})
const transformBetData = (data: EventSubChannelPredictionProgressEvent) => ({
  title: data.title,
  endDate: data.lockDate,
  outcomes: data.outcomes.map((outcome) => ({
    totalVotes: outcome.channelPoints,
    totalUsers: outcome.users,
    title: outcome.title,
    topUsers: Array.isArray(outcome.topPredictors)
      ? outcome.topPredictors.map((topUser) => ({
          userDisplayName: topUser.userDisplayName,
          channelPointsUsed: topUser.channelPointsUsed,
          channelPointsWon: topUser.channelPointsWon,
        }))
      : [],
  })),
})

const events: { [key in string]: Event } = {
  subscribeToStreamOnlineEvents: {
    customHandler: onlineEvent,
  },
  subscribeToStreamOfflineEvents: {
    customHandler: offlineEvent,
  },
  subscribeToUserUpdateEvents: {
    customHandler: updateUserEvent,
  },
  subscribeToUserAuthorizationRevokeEvents: {
    customHandler: (data: EventSubUserAuthorizationRevokeEvent) => {
      // todo: remove user from db
    },
  },
  subscribeToChannelPredictionBeginEvents: {
    sendToSocket: transformBetData,
  },
  subscribeToChannelPredictionProgressEvents: {
    sendToSocket: transformBetData,
  },
  subscribeToChannelPredictionLockEvents: {
    sendToSocket: transformBetData,
  },
  subscribeToChannelPredictionEndEvents: {
    sendToSocket: transformBetData,
  },
  subscribeToChannelPollBeginEvents: {
    sendToSocket: transformPollData,
  },
  subscribeToChannelPollProgressEvents: {
    sendToSocket: transformPollData,
  },
  subscribeToChannelPollEndEvents: {
    sendToSocket: transformPollData,
  },
}

const handleEvent = (eventName: keyof typeof events, data: any) => {
  if (!eventsIOConnected) {
    return
  }

  const event = events[eventName]

  if (event.customHandler) {
    event.customHandler(data)
    return
  }

  if (event.sendToSocket) {
    io.to(DOTABOD_EVENTS_ROOM).emit(
      'event',
      eventName,
      data.broadcasterId,
      event.sendToSocket(data),
    )
  }
}

export const SubscribeEvents = (accountIds: string[]) => {
  const promises: Promise<any>[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(
        ...Object.keys(events).map((eventName) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return listener[eventName as EventSubHttpListenerKey](userId, (data: any) =>
              handleEvent(eventName, data),
            )
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
}

// All when booting server
const accountIds = await getAccountIds()

SubscribeEvents(accountIds)
