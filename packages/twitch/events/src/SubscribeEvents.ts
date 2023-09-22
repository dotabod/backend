import { listener } from './listener.js'
import { transformBetData } from './twitch/events/transformers/transformBetData.js'
import { transformPollData } from './twitch/events/transformers/transformPollData.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from './utils/socketUtils.js'

export const handleEvent = (eventName: any, data: any) => {
  if (!eventsIOConnected) {
    console.log('[TWITCHEVENTS] No socket connection')
    return
  }
  console.log('[TWITCHEVENTS] Emitting event', { eventName, data })
  socketIo.to(DOTABOD_EVENTS_ROOM).emit('event', eventName, data.broadcasterId, data)
}

export const SubscribeEvents = (accountIds: string[]) => {
  const promises: any[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(listener.onStreamOnline(userId, onlineEvent))
      promises.push(listener.onStreamOffline(userId, offlineEvent))
      promises.push(listener.onUserUpdate(userId, updateUserEvent))
      promises.push(
        listener.onChannelPredictionBegin(userId, (data) =>
          handleEvent('onChannelPredictionBegin', transformBetData(data)),
        ),
      )
      promises.push(
        listener.onChannelPredictionProgress(userId, (data) =>
          handleEvent('onChannelPredictionProgress', transformBetData(data)),
        ),
      )
      promises.push(
        listener.onChannelPredictionLock(userId, (data) =>
          handleEvent('onChannelPredictionLock', transformBetData(data)),
        ),
      )
      promises.push(
        listener.onChannelPredictionEnd(userId, (data) =>
          handleEvent('onChannelPredictionEnd', transformBetData(data)),
        ),
      )
      promises.push(
        listener.onChannelPollBegin(userId, (data) =>
          handleEvent('onChannelPollBegin', transformPollData(data)),
        ),
      )
      promises.push(
        listener.onChannelPollProgress(userId, (data) =>
          handleEvent('onChannelPollProgress', transformPollData(data)),
        ),
      )
      promises.push(
        listener.onChannelPollEnd(userId, (data) =>
          handleEvent('onChannelPollEnd', transformPollData(data)),
        ),
      )
    } catch (e) {
      console.log('[TWITCHEVENTS] could not sub', { e, userId })
    }
  })

  console.log('[TWITCHEVENTS] Starting promise waiting for length', { length: accountIds.length })
  Promise.all(promises)
    .then(() =>
      console.log('[TWITCHEVENTS] done subbing to channelLength:', {
        channelLength: accountIds.length,
      }),
    )
    .catch((e) => {
      console.log('[TWITCHEVENTS] Could not sub due to error', { error: e })
    })
}
