import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { type TwitchEventTypes, genericSubscribe } from './subscribeChatMessagesForUser.js'
import { logger } from './twitch/lib/logger.js'
import { revokeEvent, stopUserSubscriptions } from './twitch/lib/revokeEvent'

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })

// For migrating users from old eventsub to new conduit
// We should check if the user has the chat message sub
// If they do not, we should revoke the old eventsub and re-subscribe to the new conduit

// Updated initUserSubscriptions function
export const initUserSubscriptions = async (providerAccountId: string) => {
  logger.info('[TWITCHEVENTS] initUserSubscriptions', { providerAccountId })

  try {
    // Check if chat message subscription exists but is not enabled
    // This means the user banned the bot, so we delete their subs and disable them
    const chatMessageSub = eventSubMap[providerAccountId]?.['channel.chat.message']
    if (chatMessageSub && chatMessageSub.status !== 'enabled') {
      await revokeEvent({ providerAccountId })
      return
    }

    // Migrate users from old eventsub to new conduit
    if (!chatMessageSub) {
      await stopUserSubscriptions(providerAccountId)
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
    console.error(e)
    logger.error('[TWITCHEVENTS] Failed to initialize subscriptions', {
      error: e,
      providerAccountId,
    })
  }
}
