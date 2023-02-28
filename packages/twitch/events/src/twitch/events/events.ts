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
  subscribeToStreamOnlineEvents: {
    customHandler: onlineEvent,
  },
  subscribeToStreamOfflineEvents: {
    customHandler: offlineEvent,
  },
  subscribeToUserUpdateEvents: {
    customHandler: updateUserEvent,
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
