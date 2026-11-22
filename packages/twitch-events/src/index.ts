import {
  checkBotStatus,
  checkSupabaseHealth,
  fetchConduitId,
  logger,
  startHeartbeat,
} from '@dotabod/shared-utils'

import { cleanUpSubscriptions, fetchExistingSubscriptions } from './fetch-existing-subscriptions.js'
import { subscribeToEvents } from './subscribe-to-events'
import { setupHealthServer } from './utils/health-server'
import { scheduleNonOverlapping } from './utils/scheduler'
import { setupSocketIO } from './utils/socket-utils'
import { runSubscriptionHealthCheck } from './utils/subscription-health-check'
import { setupAccountWatcher } from './watcher'

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000

const reconcileSubscriptions = async function reconcileSubscriptions(): Promise<void> {
  try {
    const conduitId = await fetchConduitId()
    if (conduitId === null || conduitId.length === 0) {
      logger.error('[TWITCHEVENTS] Missing conduit ID for inventory refresh')
      return
    }
    const subsToCleanup = await fetchExistingSubscriptions(conduitId)
    await cleanUpSubscriptions(subsToCleanup)
    await subscribeToEvents()
  } catch (error) {
    logger.error('[TWITCHEVENTS] Background reconciliation failed', {
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
const startupReconciliation = reconcileSubscriptions()

// Safety net: every 5 minutes, scan all valid accounts and re-register any
// missing critical EventSub subscriptions. Catches Realtime delivery gaps
// (channel drops, replica lag, deploy windows) so the fleet stays self-healing
// without crontab restarts. Uses an overlap-protected scheduler so a slow
// scan can't double-fire and race on `eventSubMap` / the shared rateLimiter.
scheduleNonOverlapping(async () => {
  try {
    await startupReconciliation
    await runSubscriptionHealthCheck()
  } catch (error) {
    logger.error('[HEALTHCHECK] subscription scan failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}, HEALTH_CHECK_INTERVAL_MS)
