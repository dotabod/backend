import { eventSubMap } from './chatSubIds'
import type { TwitchEventSubSubscriptionsResponse } from './interfaces'
import { logger } from './twitch/lib/logger'
import { rateLimiter } from './utils/rateLimiter'
import { getTwitchHeaders } from './getTwitchHeaders.js'

// Constants
const headers = await getTwitchHeaders()
export const subsToCleanup: string[] = []
let fetchedCount = 0
let totalSubscriptions = 0
let startTime = 0
const uniqueBroadcasters = new Set<string>()
const statusCounts: Record<string, number> = {}

export async function fetchExistingSubscriptions() {
  startTime = Date.now()
  logger.info('[TWITCHEVENTS] Fetching existing subscriptions')
  let cursor: string | undefined
  let pageCount = 0
  let lastLogTime = Date.now()

  do {
    pageCount++
    await rateLimiter.schedule(async () => {
      const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions')
      if (cursor) url.searchParams.append('after', cursor)

      const subsReq = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      // Update rate limit info
      rateLimiter.updateLimits(subsReq.headers)

      if (subsReq.status === 429) {
        logger.warn('Rate limit hit, will retry automatically')
        throw new Error('Rate limit hit')
      }

      const { data, pagination, total } =
        (await subsReq.json()) as TwitchEventSubSubscriptionsResponse

      // Update total count if available
      if (total !== undefined && totalSubscriptions === 0) {
        totalSubscriptions = total
      }

      // Store subscriptions in eventSubMap, organizing by broadcaster ID
      data.forEach((sub) => {
        const broadcasterId = (sub.condition.broadcaster_user_id || sub.condition.user_id) as
          | string
          | undefined

        if (!broadcasterId || sub.transport.method === 'webhook') {
          subsToCleanup.push(sub.id)
          return
        }

        // Track unique broadcasters
        uniqueBroadcasters.add(broadcasterId)

        // Track subscription status
        statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1

        // Initialize broadcaster entry if it doesn't exist
        eventSubMap[broadcasterId] ??= {} as (typeof eventSubMap)[number]

        // Store subscription details
        eventSubMap[broadcasterId][sub.type] = {
          id: sub.id,
          status: sub.status,
        }

        fetchedCount++
      })

      // Log progress periodically (every 1000 items or 5 seconds, whichever comes first)
      const now = Date.now()
      const timeSinceLastLog = now - lastLogTime
      if (fetchedCount % 1000 === 0 || timeSinceLastLog > 5000) {
        lastLogTime = now

        // Calculate progress metrics
        const elapsedSec = (now - startTime) / 1000
        const percentComplete =
          totalSubscriptions > 0 ? Math.round((fetchedCount / totalSubscriptions) * 100) : '?'

        // Estimate remaining time if we have total count
        let timeEstimate = ''
        if (totalSubscriptions > 0 && fetchedCount > 0) {
          const estimatedTotalSec = elapsedSec / (fetchedCount / totalSubscriptions)
          const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)
          timeEstimate = `~${Math.round(remainingSec / 60)} minutes remaining`
        }

        logger.info('[TWITCHEVENTS] Subscription fetch progress', {
          processed: fetchedCount,
          total: totalSubscriptions > 0 ? totalSubscriptions : 'unknown',
          percent: typeof percentComplete === 'number' ? `${percentComplete}%` : percentComplete,
          pages: pageCount,
          broadcasters: uniqueBroadcasters.size,
          cleanup: subsToCleanup.length,
          timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
          ...(timeEstimate ? { timeEstimate } : {}),
          rateLimit: {
            remaining: rateLimiter.rateLimitStatus.remaining,
            queueLength: rateLimiter.queueLength,
          },
        })
      }

      cursor = pagination?.cursor
    })
  } while (cursor)

  // Calculate final metrics
  const totalTime = (Date.now() - startTime) / 1000
  const minutes = Math.floor(totalTime / 60)
  const seconds = Math.round(totalTime % 60)

  // Log comprehensive summary when complete
  logger.info('[TWITCHEVENTS] Finished loading subscriptions', {
    total: {
      subscriptions: fetchedCount,
      broadcasters: uniqueBroadcasters.size,
      cleanupNeeded: subsToCleanup.length,
    },
    statusBreakdown: statusCounts,
    timing: {
      totalTime: `${minutes}m ${seconds}s`,
      pagesProcessed: pageCount,
      averageRate: `${Math.round(fetchedCount / totalTime)} subs/sec`,
    },
    rateLimit: {
      remaining: rateLimiter.rateLimitStatus.remaining,
      queueLength: rateLimiter.queueLength,
    },
  })
}
