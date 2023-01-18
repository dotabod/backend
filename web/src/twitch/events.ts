import './commandLoader.js'

import { io } from 'socket.io-client'

import { logger } from '../utils/logger.js'

// Our docker events forwarder instance
const twitchEvent = io('ws://twitch-eventsub-listener:5015')

twitchEvent.on('connect', () => {
  logger.info('We alive on dotabod twitch events server!')
})

twitchEvent.on('event', function (eventName: string, broadcasterId: string, data: any) {
  // Can start doing something with the events
  // console.log(eventName, broadcasterId, data)
})

// here for example, not a used const
const events = [
  'subscribeToChannelPredictionBeginEvents',
  'subscribeToChannelPredictionProgressEvents',
  'subscribeToChannelPredictionLockEvents',
  'subscribeToChannelPredictionEndEvents',
  'subscribeToChannelPollBeginEvents',
  'subscribeToChannelPollProgressEvents',
  'subscribeToChannelPollEndEvents',
]
