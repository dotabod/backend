import { eventSubMap } from './chatSubIds.js'
import { fetchConduitId } from './fetchConduitId.js'
import { genericSubscribe } from './subscribeChatMessagesForUser.js'
import type { TwitchEventTypes } from './TwitchEventTypes.js'
import { logger } from './twitch/lib/logger.js'
import { checkBotStatus } from './botBanStatus'
import { ensureBotIsModerator } from './ensureBotIsModerator.js'

// Get existing conduit ID and subscriptions
const conduitId = await fetchConduitId()
logger.info('Conduit ID', { conduitId })

// For migrating users from old eventsub to new conduit
// We should check if the user has the chat message sub
// If they do not, we should revoke the old eventsub and re-subscribe to the new conduit

// Updated initUserSubscriptions function
export const initUserSubscriptions = async (providerAccountId: string) => {
  const isBanned = await checkBotStatus()

  try {
    if (eventSubMap[providerAccountId]) {
      logger.info('[TWITCHEVENTS] Subscriptions already exist', { providerAccountId })
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

    // Subscribe to all event types, continuing even if some fail
    const results = await Promise.allSettled(
      subscriptionTypes.map((type) => genericSubscribe(conduitId, providerAccountId, type)),
    )

    // Log any failures but don't fail the entire process
    results.forEach((result, index) => {
      if (result?.status === 'rejected') {
        logger.warn(`Failed to subscribe to ${subscriptionTypes[index]}`, {
          error: result.reason,
          providerAccountId,
        })
      }
    })

    // After setting up subscriptions, ensure the bot is a moderator
    if (!isBanned) {
      await ensureBotIsModerator(providerAccountId)
    }
  } catch (e) {
    console.error(e)
    logger.error('[TWITCHEVENTS] Failed to initialize subscriptions', {
      error: e,
      providerAccountId,
    })
  }
}
