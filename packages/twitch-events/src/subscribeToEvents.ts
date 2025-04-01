import { fetchConduitId } from './fetchConduitId.js'
import { initUserSubscriptions } from './initUserSubscriptions.js'
import { subscribeToAuthGrantOrRevoke } from './subscribeChatMessagesForUser.js'
import { getAccountIds } from './twitch/lib/getAccountIds.js'
import { logger } from './twitch/lib/logger.js'
import { rateLimiter } from './utils/rateLimiter.js'

export async function subscribeToEvents() {
  const conduitId = await fetchConduitId()
  logger.info('[TWITCHEVENTS] Subscribing to events', { conduitId })

  await subscribeToAuthGrantOrRevoke(conduitId, process.env.TWITCH_CLIENT_ID!)

  const accountIds = await getAccountIds()
  // Process accounts in chunks to avoid overwhelming the rate limiter
  const CHUNK_SIZE = 10
  logger.info('[TWITCHEVENTS] Processing accounts', {
    total: accountIds.length,
    rateLimit: rateLimiter.rateLimitStatus,
  })

  for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
    const chunk = accountIds.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (providerAccountId) => {
        try {
          await initUserSubscriptions(providerAccountId)
        } catch (e) {
          logger.info('[TWITCHEVENTS] could not sub or set moderator', { e, providerAccountId })
        }
      }),
    )

    if ((i + CHUNK_SIZE) % 100 === 0 || i + CHUNK_SIZE >= accountIds.length) {
      logger.info('[TWITCHEVENTS] Subscription progress', {
        processed: Math.min(i + CHUNK_SIZE, accountIds.length),
        total: accountIds.length,
        rateLimit: rateLimiter.rateLimitStatus,
      })
    }
  }
}
