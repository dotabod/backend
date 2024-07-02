import type { EventSubSubscription } from '@twurple/eventsub-base'
import { listener } from './listener.js'
import { transformBetData } from './twitch/events/transformers/transformBetData.js'
import { transformPollData } from './twitch/events/transformers/transformPollData.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from './utils/socketUtils.js'

export const handleEvent = (eventName: any, broadcasterId: string, data: any) => {
  if (!eventsIOConnected) {
    return
  }
  socketIo.to(DOTABOD_EVENTS_ROOM).emit('event', eventName, broadcasterId, data)
}

// Map to store subscriptions for each user
export const userSubscriptions: Record<string, Array<EventSubSubscription>> = {}

// Function to init subscriptions for a user
const initUserSubscriptions = (providerAccountId: string) => {
  const subscriptions = [
    listener.onStreamOnline(providerAccountId, onlineEvent),
    listener.onStreamOffline(providerAccountId, offlineEvent),
    listener.onUserUpdate(providerAccountId, updateUserEvent),
    listener.onChannelPredictionBegin(providerAccountId, (data) =>
      handleEvent('onChannelPredictionBegin', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionProgress(providerAccountId, (data) =>
      handleEvent('onChannelPredictionProgress', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionLock(providerAccountId, (data) =>
      handleEvent('onChannelPredictionLock', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPredictionEnd(providerAccountId, (data) =>
      handleEvent('onChannelPredictionEnd', providerAccountId, transformBetData(data)),
    ),
    listener.onChannelPollBegin(providerAccountId, (data) =>
      handleEvent('onChannelPollBegin', providerAccountId, transformPollData(data)),
    ),
    listener.onChannelPollProgress(providerAccountId, (data) =>
      handleEvent('onChannelPollProgress', providerAccountId, transformPollData(data)),
    ),
    listener.onChannelPollEnd(providerAccountId, (data) =>
      handleEvent('onChannelPollEnd', providerAccountId, transformPollData(data)),
    ),
  ]

  userSubscriptions[providerAccountId] = subscriptions
}

// Function to stop subscriptions for a user
export const stopUserSubscriptions = (providerAccountId: string) => {
  const subscriptions = userSubscriptions[providerAccountId]
  if (subscriptions) {
    subscriptions.forEach((subscription) => subscription.stop())
    delete userSubscriptions[providerAccountId]
    console.log(
      `[TWITCHEVENTS] Unsubscribed from events for providerAccountId: ${providerAccountId}`,
    )
  } else {
    console.log(
      `[TWITCHEVENTS] stopUserSubscriptions No subscriptions found for providerAccountId: ${providerAccountId}`,
    )
  }
}

// Function to start subscriptions for a user
export const startUserSubscriptions = (providerAccountId: string) => {
  initUserSubscriptions(providerAccountId)
  console.log(`[TWITCHEVENTS] Subscribed events for providerAccountId: ${providerAccountId}`)
}

// Function to subscribe to events for multiple users
export const SubscribeEvents = (accountIds: string[]) => {
  accountIds.forEach((providerAccountId) => {
    try {
      initUserSubscriptions(providerAccountId)
    } catch (e) {
      console.log('[TWITCHEVENTS] could not sub', { e, providerAccountId })
    }
  })
}
