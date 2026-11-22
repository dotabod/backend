import { checkSupabaseHealth, logger, startHeartbeat } from '@dotabod/shared-utils'

import { redisClient } from './db/redis-instance'
import { startDota } from './dota/index.js'
import { steamSocket } from './steam/ws'

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

const logAndExit = (error: Error): never => {
  logger.error('Unhandled error occurred. Exiting...', { error })
  process.exit(1)
}

process.on('uncaughtException', logAndExit)
process.on('unhandledRejection', (reason) => {
  logAndExit(new Error('Unhandled rejection', { cause: reason }))
})

try {
  await startDota()
  await import('./twitch/index.js')
} catch (error) {
  logAndExit(new Error('Dota startup failed', { cause: error }))
}

// Report dota's dependency health to dedicated Uptime Kuma push monitors.
// dota process liveness is already covered by the gsi.dotabod.com HTTP monitor.
startHeartbeat({
  debounceMs: 60_000,
  getStatus: () => ({
    msg: redisClient.client.isReady ? 'connected' : 'redis disconnected',
    up: redisClient.client.isReady,
  }),
  name: 'dota redis heartbeat',
  url: process.env.KUMA_PUSH_URL_REDIS,
})

startHeartbeat({
  debounceMs: 90_000,
  getStatus: () => ({
    msg: steamSocket.connected ? 'connected' : 'steam socket disconnected',
    up: steamSocket.connected,
  }),
  name: 'dota steam-socket heartbeat',
  url: process.env.KUMA_PUSH_URL_STEAM,
})

// Dependency-aware Supabase probe: catches the container losing its route to
// Supabase (e.g. the docker network being recreated under it), which the
// liveness monitors above can't see because the process stays up.
startHeartbeat({
  debounceMs: 90_000,
  getStatus: checkSupabaseHealth,
  name: 'dota supabase heartbeat',
  url: process.env.KUMA_PUSH_URL_SUPABASE,
})
