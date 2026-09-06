import { checkBotStatus, checkSupabaseHealth, logger, startHeartbeat } from '@dotabod/shared-utils'

import { fetchExistingSubscriptions, subsToCleanup } from './fetch-existing-subscriptions'
import { subscribeToEvents } from './subscribe-to-events'
import { deleteSubscription } from './twitch/lib/revoke-event'
import { setupHealthServer } from './utils/health-server'
import { rateLimiter } from './utils/rate-limiter-core'
import { scheduleNonOverlapping } from './utils/scheduler'
import { setupSocketIO } from './utils/socket-utils'
import { runSubscriptionHealthCheck } from './utils/subscription-health-check'
import { setupAccountWatcher } from './watcher'

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000
const CLEANUP_CHUNK_SIZE = 30

interface CleanupProgress {
  completed: number
  lastLogTime: number
  startTime: number
}

const logDeletionProgress = function logDeletionProgress(
  progress: CleanupProgress,
  total: number
): void {
  const now = Date.now()
  const shouldLog =
    progress.completed % 500 === 0 ||
    now - progress.lastLogTime > 10_000 ||
    progress.completed === total
  if (!shouldLog) {
    return
  }

  progress.lastLogTime = now
  const percentComplete = Math.round((progress.completed / total) * 100)
  const elapsedSec = (now - progress.startTime) / 1000
  const estimatedTotalSec = elapsedSec / (progress.completed / total)
  const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec)

  logger.info('[TWITCHEVENTS] Deletion progress', {
    completed: progress.completed,
    percent: `${percentComplete}%`,
    rateLimit: {
      queueLength: rateLimiter.queueLength,
      remaining: rateLimiter.rateLimitStatus.remaining,
    },
    timeElapsed: `${Math.round(elapsedSec / 60)}m ${Math.round(elapsedSec % 60)}s`,
    timeRemaining: `~${Math.round(remainingSec / 60)} minutes`,
    total,
  })
}

const deleteSubscriptionChunk = async function deleteSubscriptionChunk(
  subscriptionIds: readonly string[],
  progress: CleanupProgress
): Promise<void> {
  await Promise.all(
    subscriptionIds.map(async (subscriptionId) => {
      await rateLimiter.schedule(async () => {
        await deleteSubscription(subscriptionId)
        progress.completed += 1
        logDeletionProgress(progress, subsToCleanup.length)
      })
    })
  )
}

const deleteSubscriptionChunks = async function deleteSubscriptionChunks(
  startIndex: number,
  progress: CleanupProgress
): Promise<void> {
  if (startIndex >= subsToCleanup.length) {
    return
  }

  await deleteSubscriptionChunk(
    subsToCleanup.slice(startIndex, startIndex + CLEANUP_CHUNK_SIZE),
    progress
  )
  await deleteSubscriptionChunks(startIndex + CLEANUP_CHUNK_SIZE, progress)
}

const cleanUpSubscriptions = async function cleanUpSubscriptions(): Promise<void> {
  logger.info('[TWITCHEVENTS] Deleting old subscriptions', { count: subsToCleanup.length })
  if (subsToCleanup.length === 0) {
    logger.info('[TWITCHEVENTS] No subscriptions to clean up')
    return
  }

  const startTime = Date.now()
  await deleteSubscriptionChunks(0, {
    completed: 0,
    lastLogTime: startTime,
    startTime,
  })

  const totalTime = (Date.now() - startTime) / 1000
  logger.info('[TWITCHEVENTS] Deletion completed', {
    timing: {
      averageRate: `${Math.round(subsToCleanup.length / totalTime)} deletions/sec`,
      totalTime: `${Math.floor(totalTime / 60)}m ${Math.round(totalTime % 60)}s`,
    },
    total: subsToCleanup.length,
  })
}

const reconcileSubscriptions = async function reconcileSubscriptions(): Promise<void> {
  try {
    await fetchExistingSubscriptions()
    await subscribeToEvents()
    await cleanUpSubscriptions()
  } catch (error) {
    logger.error('[TWITCHEVENTS] Background reconciliation failed', {
      count: subsToCleanup.length,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

process.on('SIGTERM', () => {
  process.exit(0)
})
process.on('SIGINT', () => {
  process.exit(0)
})

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
  debounceMs: 90_000,
  getStatus: checkSupabaseHealth,
  name: 'twitch-events supabase heartbeat',
  url: process.env.KUMA_PUSH_URL_SUPABASE,
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

void reconcileSubscriptions()
