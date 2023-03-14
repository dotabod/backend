import { transformBetData } from './transformers/transformBetData.js'
import { transformPollData } from './transformers/transformPollData.js'
import { offlineEvent } from '../lib/offlineEvent.js'
import { onlineEvent } from '../lib/onlineEvent.js'
import { updateUserEvent } from '../lib/updateUserEvent.js'

interface Event {
  customHandler?: (data: any) => void | Promise<any>
  sendToSocket?: (data: any) => void
}

export const events: { [key in string]: Event } = {
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

// Self clearing set to try to solve this race condition from twitch:
// https://github.com/dotabod/backend/issues/250
export const onlineEvents = new Map<string, Date>()
