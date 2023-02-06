import { EventSubUserAuthorizationRevokeEvent } from '@twurple/eventsub-base'

import { offlineEvent } from '../lib/offlineEvent.js'
import { onlineEvent } from '../lib/onlineEvent.js'
import { updateUserEvent } from '../lib/updateUserEvent.js'
import { transformBetData } from './transformers/transformBetData.js'
import { transformPollData } from './transformers/transformPollData.js'

interface Event {
  customHandler?: (data: any) => void
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
