process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

import { checkSupabaseHealth, startHeartbeat } from '@dotabod/shared-utils'
import { redisClient } from './db/redisInstance'
import { steamSocket } from './steam/ws'

function initServer() {
  Promise.all([import('./dota/index'), import('./twitch/index')])
    .then(() => {
      // All imports are now loaded
      console.log('Modules loaded')
    })
    .catch((e) => {
      console.error('Error during setup:', e)
    })
  // ... any other setup you might need
}

initServer()

// Report dota's dependency health to dedicated Uptime Kuma push monitors.
// dota process liveness is already covered by the gsi.dotabod.com HTTP monitor.
startHeartbeat({
  url: process.env.KUMA_PUSH_URL_REDIS,
  name: 'dota redis heartbeat',
  debounceMs: 60_000,
  getStatus: () => ({
    up: redisClient.client.isReady,
    msg: redisClient.client.isReady ? 'connected' : 'redis disconnected',
  }),
})

startHeartbeat({
  url: process.env.KUMA_PUSH_URL_STEAM,
  name: 'dota steam-socket heartbeat',
  debounceMs: 90_000,
  getStatus: () => ({
    up: steamSocket.connected,
    msg: steamSocket.connected ? 'connected' : 'steam socket disconnected',
  }),
})

// Dependency-aware Supabase probe: catches the container losing its route to
// Supabase (e.g. the docker network being recreated under it), which the
// liveness monitors above can't see because the process stays up.
startHeartbeat({
  url: process.env.KUMA_PUSH_URL_SUPABASE,
  name: 'dota supabase heartbeat',
  debounceMs: 90_000,
  getStatus: checkSupabaseHealth,
})
