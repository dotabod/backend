import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
} from '@twurple/eventsub-base'

import { server } from '../dota/index.js'
import { getTokenFromTwitchId } from '../dota/lib/connectedStreamers.js'
import { twitchChat } from './index.js'

const events = {
  subscribeToChannelPredictionBeginEvents: EventSubChannelPredictionBeginEvent,
  subscribeToChannelPredictionProgressEvents: EventSubChannelPredictionProgressEvent,
  subscribeToChannelPredictionLockEvents: EventSubChannelPredictionLockEvent,
  subscribeToChannelPredictionEndEvents: EventSubChannelPredictionEndEvent,
  subscribeToChannelPollBeginEvents: EventSubChannelPollBeginEvent,
  subscribeToChannelPollProgressEvents: EventSubChannelPollProgressEvent,
  subscribeToChannelPollEndEvents: EventSubChannelPollEndEvent,
}

export type Events = keyof typeof events

twitchChat.on('event', (eventName: Events, broadcasterId: string, data: any) => {
  // Can start doing something with the events

  const token = getTokenFromTwitchId(broadcasterId)
  if (!token) return

  server.io.to(token).emit('channelPollOrBet', data, eventName)
})
