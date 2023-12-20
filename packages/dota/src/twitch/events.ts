import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
} from '@twurple/eventsub-base'
import { io } from 'socket.io-client'

import { server } from '../dota/index.js'
import { getTokenFromTwitchId } from '../dota/lib/connectedStreamers.js'
import { logger } from '../utils/logger.js'

logger.info("Starting 'twitch' package events")

// Our docker events forwarder instance
const twitchEvent = io('ws://twitch-events:5015')

twitchEvent.on('connect', () => {
  logger.info('We alive on dotabod twitch events server!')
})

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

twitchEvent.on('event', function (eventName: Events, broadcasterId: string, data: any) {
  // Can start doing something with the events

  const token = getTokenFromTwitchId(broadcasterId)
  if (!token) return

  server.io.to(token).emit('channelPollOrBet', data, eventName)
})
