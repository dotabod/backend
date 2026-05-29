process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

import { checkBotStatus, checkSupabaseHealth, logger, startHeartbeat } from '@dotabod/shared-utils'
import { fetchExistingSubscriptions, subsToCleanup } from './fetchExistingSubscriptions'
import { subscribeToEvents } from './subscribeToEvents'
import { deleteSubscription } from './twitch/lib/revokeEvent'
import { setupHealthServer } from './utils/healthServer'
import { rateLimiter } from './utils/rateLimiterCore'
import { scheduleNonOverlapping } from './utils/scheduler'
import { setupSocketIO } from './utils/socketUtils'
import { runSubscriptionHealthCheck } from './utils/subscriptionHealthCheck'
import { setupAccountWatcher } from './watcher'

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000

const isBanned = await checkBotStatus()
if (isBanned) {
  logger.error('Bot is banned!')
}

setupSocketIO()
setupHealthServer()

// Dependency-aware Supabase probe. The /webhook liveness endpoint only catches
// a full process crash; a Supabase outage that doesn't crash the process (auth
// failure, postgrest 5xx, DB unreachable while the socket survives) would go
// unnoticed without this. On 2026-05-29 the watcher crash-looped on a DNS-level
// Supabase outage — this gives the same class of failure a direct signal.
startHeartbeat({
  url: process.env.KUMA_PUSH_URL_SUPABASE,
  name: 'twitch-events supabase heartbeat',
  debounceMs: 90_000,
  getStatus: checkSupabaseHealth,
})

// Supabase Realtime listener — replaces the old HTTP webhook receiver.
// Delivers INSERT/UPDATE/DELETE on accounts + UPDATE on users in seconds.
setupAccountWatcher()

// Safety net: every 5 minutes, scan all valid accounts and re-register any
// missing critical EventSub subscriptions. Catches Realtime delivery gaps
// (channel drops, replica lag, deploy windows) so the fleet stays self-healing
// without crontab restarts. Uses an overlap-protected scheduler so a slow
// scan can't double-fire and race on `eventSubMap` / the shared rateLimiter.
scheduleNonOverlapping(async () => {
  try {
    await runSubscriptionHealthCheck()
  } catch (error) {
    logger.error('[HEALTHCHECK] subscription scan failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}, HEALTH_CHECK_INTERVAL_MS)

void (async () => {
  try {
    await fetchExistingSubscriptions()

    await subscribeToEvents()

    logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })

    if (subsToCleanup.length > 0) {
      const CHUNK_SIZE = 30
      let completed = 0
      const startTime = Date.now()
      let lastLogTime = Date.now()

      for (let i = 0; i < subsToCleanup.length; i += CHUNK_SIZE) {
        const chunk = subsToCleanup.slice(i, i + CHUNK_SIZE)
        await Promise.all(
          chunk.map(async (subId) => {
            await rateLimiter.schedule(async () => {
              await deleteSubscription(subId)
              completed++

              const now = Date.now()
              const shouldLog =
                completed % 500 === 0 ||
                now - lastLogTime > 10000 ||
                completed === subsToCleanup.length

              if (shouldLog) {
                lastLogTime = now

                const percentComplete = Math.round((completed / subsToCleanup.length) * 100)
                const elapsedSec = (now - startTime) / 1000
                const estimatedTotalSec = elapsedSec / (completed / subsToCleanup.length)
                const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

                logger.info('[TWITCHEVENTS] Deletion progress', {
                  completed,
                  total: subsToCleanup.length,
                  percent: `${percentComplete}%`,
                  timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
                  timeRemaining: `~${Math.round(remainingSec / 60)} minutes`,
                  rateLimit: {
                    remaining: rateLimiter.rateLimitStatus.remaining,
                    queueLength: rateLimiter.queueLength,
                  },
                })
              }
            })
          }),
        )
      }

      const totalTime = (Date.now() - startTime) / 1000
      logger.info('[TWITCHEVENTS] Deletion completed', {
        total: subsToCleanup.length,
        timing: {
          totalTime: `${Math.floor(totalTime / 60)}m ${Math.round(totalTime % 60)}s`,
          averageRate: `${Math.round(subsToCleanup.length / totalTime)} deletions/sec`,
        },
      })
    } else {
      logger.info('[TWITCHEVENTS] No subscriptions to clean up')
    }
  } catch (error) {
    logger.error('[TWITCHEVENTS] Background reconciliation failed', {
      error: error instanceof Error ? error.message : String(error),
      count: subsToCleanup.length,
    })
  }
})()
