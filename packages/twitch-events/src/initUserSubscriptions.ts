import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { type TwitchEventTypes, genericSubscribe } from './subscribeChatMessagesForUser.js'
import { logger } from './twitch/lib/logger.js'
import { revokeEvent } from './twitch/lib/revokeEvent'

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })

// Updated initUserSubscriptions function
export const initUserSubscriptions = async (providerAccountId: string) => {
  try {
    // Check if chat message subscription exists but is not enabled
    const chatMessageSub = eventSubMap[providerAccountId]?.['channel.chat.message']
    if (chatMessageSub && chatMessageSub.status !== 'enabled') {
      await revokeEvent({ providerAccountId })
      return
    }

    if (eventSubMap[providerAccountId]) {
      // logger.info('[TWITCHEVENTS] Subscriptions already exist', { providerAccountId })
      return
    }

    // Define subscription types to initialize
    const subscriptionTypes: (keyof TwitchEventTypes)[] = [
      'channel.chat.message',
      'stream.offline',
      'stream.online',
      'user.update',
      'channel.prediction.begin',
      'channel.prediction.progress',
      'channel.prediction.lock',
      'channel.prediction.end',
      'channel.poll.begin',
      'channel.poll.progress',
      'channel.poll.end',
    ] as const

    // Subscribe to all event types
    await Promise.all(
      subscriptionTypes.map((type) => genericSubscribe(conduitId, providerAccountId, type)),
    )
  } catch (e) {
    logger.error('[TWITCHEVENTS] Failed to initialize subscriptions', {
      error: e,
      providerAccountId,
    })
  }
}
