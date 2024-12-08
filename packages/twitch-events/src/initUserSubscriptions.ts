import type { EventSubSubscription } from '@twurple/eventsub-base'
import { chatSubIds } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { getTwitchHeaders } from './getTwitchHeaders.js'
import { listener } from './listener.js'
import { subscribeChatMessagesForUser } from './subscribeChatMessagesForUser.js'
import { transformBetData } from './twitch/events/transformers/transformBetData.js'
import { transformPollData } from './twitch/events/transformers/transformPollData.js'
import { logger } from './twitch/lib/logger.js'
import { offlineEvent } from './twitch/lib/offlineEvent.js'
import { onlineEvent } from './twitch/lib/onlineEvent.js'
import { updateUserEvent } from './twitch/lib/updateUserEvent.js'
import { DOTABOD_EVENTS_ROOM, eventsIOConnected, socketIo } from './utils/socketUtils.js'

// Constants
const headers = await getTwitchHeaders()

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })

// Map to store subscriptions for each user
export const userSubscriptions: Record<string, Array<EventSubSubscription>> = {}

const handleEvent = (eventName: any, broadcasterId: string, data: any) => {
  if (!eventsIOConnected) return
  socketIo.to(DOTABOD_EVENTS_ROOM).emit('event', eventName, broadcasterId, data)
}

// Helper function to delete a subscription
async function deleteSubscription(subscriptionId: string) {
  try {
    await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`, {
      method: 'DELETE',
      headers,
    })
    logger.info('[TWITCHEVENTS] Deleted subscription', { id: subscriptionId })
  } catch (e) {
    logger.error('[TWITCHEVENTS] Failed to delete subscription', {
      error: e,
      id: subscriptionId,
    })
  }
}

// Updated initUserSubscriptions function
export const initUserSubscriptions = async (providerAccountId: string) => {
  try {
    // Handle chat message subscription
    if (chatSubIds[providerAccountId]?.status !== 'enabled') {
      if (chatSubIds[providerAccountId]) {
        await deleteSubscription(chatSubIds[providerAccountId].id)
        delete chatSubIds[providerAccountId]
      }
      await subscribeChatMessagesForUser(conduitId, providerAccountId)
    }

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
  } catch (e) {
    logger.error('[TWITCHEVENTS] Failed to initialize subscriptions', {
      error: e,
      providerAccountId,
    })
  }
}
