import {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionEndEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionProgressEvent,
  EventSubStreamOfflineEvent,
  EventSubStreamOnlineEvent,
  EventSubUserUpdateEvent,
} from '@twurple/eventsub-base'
import { EventSubMiddleware } from '@twurple/eventsub-http'

import { transformBetData } from './transformers/transformBetData.js'
import { transformPollData } from './transformers/transformPollData.js'
import { offlineEvent } from '../lib/offlineEvent.js'
import { onlineEvent } from '../lib/onlineEvent.js'
import { updateUserEvent } from '../lib/updateUserEvent.js'

export type PossibleEvents = {
  onChannelPredictionBegin: (
    event: EventSubChannelPredictionBeginEvent,
  ) => ReturnType<typeof transformBetData>
  onChannelPredictionProgress: (
    event: EventSubChannelPredictionProgressEvent,
  ) => ReturnType<typeof transformBetData>
  onChannelPredictionLock: (
    event: EventSubChannelPredictionLockEvent,
  ) => ReturnType<typeof transformBetData>
  onChannelPredictionEnd: (
    event: EventSubChannelPredictionEndEvent,
  ) => ReturnType<typeof transformBetData>
  onChannelPollBegin: (event: EventSubChannelPollBeginEvent) => ReturnType<typeof transformPollData>
  onChannelPollProgress: (
    event: EventSubChannelPollProgressEvent,
  ) => ReturnType<typeof transformPollData>
  onChannelPollEnd: (event: EventSubChannelPollEndEvent) => ReturnType<typeof transformPollData>
}

export type CustomHandlerEvents = {
  onStreamOnline: (event: EventSubStreamOnlineEvent) => void | Promise<void>
  onStreamOffline: (event: EventSubStreamOfflineEvent) => void | Promise<void>
  onUserUpdate: (event: EventSubUserUpdateEvent) => void | Promise<void>
}

type EventA<key extends keyof CustomHandlerEvents> = {
  customHandler?: CustomHandlerEvents[key]
}
type EventB<key extends keyof PossibleEvents> = {
  sendToSocket?: PossibleEvents[key]
}

export const events:
  | {
      [key in keyof PossibleEvents]: EventB<key>
    }
  | {
      [key in keyof CustomHandlerEvents]: EventA<key>
    } = {
  onStreamOnline: {
    customHandler: onlineEvent,
  },
  onStreamOffline: {
    customHandler: offlineEvent,
  },
  onUserUpdate: {
    customHandler: updateUserEvent,
  },
  onChannelPredictionBegin: {
    sendToSocket: transformBetData,
  },
  onChannelPredictionProgress: {
    sendToSocket: transformBetData,
  },
  onChannelPredictionLock: {
    sendToSocket: transformBetData,
  },
  onChannelPredictionEnd: {
    sendToSocket: transformBetData,
  },
  onChannelPollBegin: {
    sendToSocket: transformPollData,
  },
  onChannelPollProgress: {
    sendToSocket: transformPollData,
  },
  onChannelPollEnd: {
    sendToSocket: transformPollData,
  },
}

export type EventName = Partial<keyof EventSubMiddleware>

// Self clearing set to try to solve this race condition from twitch:
// https://github.com/dotabod/backend/issues/250
export const onlineEvents = new Map<string, Date>()
