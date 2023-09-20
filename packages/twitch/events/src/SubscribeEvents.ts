import { middleware } from './listener.js'
import { transformBetData } from './twitch/events/transformers/transformBetData.js'
import { transformPollData } from './twitch/events/transformers/transformPollData.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from './utils/socketUtils.js'

export const handleEvent = (eventName: any, data: any) => {
  if (!eventsIOConnected) return
  socketIo.to(DOTABOD_EVENTS_ROOM).emit('event', eventName, data.broadcasterId, data)
}

export const SubscribeEvents = (accountIds: string[]) => {
  const promises: any[] = []
  accountIds.forEach((userId) => {
    try {
      promises.push(middleware.onStreamOnline(userId, onlineEvent))
      promises.push(middleware.onStreamOffline(userId, offlineEvent))
      promises.push(middleware.onUserUpdate(userId, updateUserEvent))
      promises.push(
        middleware.onChannelPredictionBegin(userId, (data) =>
          handleEvent('onChannelPredictionBegin', transformBetData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPredictionProgress(userId, (data) =>
          handleEvent('onChannelPredictionProgress', transformBetData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPredictionLock(userId, (data) =>
          handleEvent('onChannelPredictionLock', transformBetData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPredictionEnd(userId, (data) =>
          handleEvent('onChannelPredictionEnd', transformBetData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPollBegin(userId, (data) =>
          handleEvent('onChannelPollBegin', transformPollData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPollProgress(userId, (data) =>
          handleEvent('onChannelPollProgress', transformPollData(data)),
        ),
      )
      promises.push(
        middleware.onChannelPollEnd(userId, (data) =>
          handleEvent('onChannelPollEnd', transformPollData(data)),
        ),
      )

      promises.push(
        middleware.onChannelPredictionBegin(userId, (data) =>
          handleEvent('onChannelPredictionBegin', data),
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
