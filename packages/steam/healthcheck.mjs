// Docker HEALTHCHECK probe for the steam service. The prod image ships node but
// no curl/wget, and steam has no HTTP surface, so we read the GC liveness
// snapshot the app writes (see steam.ts writeGcHealth / GC_HEALTH_PATH).
//
// Lives in the shared packages/Dockerfile prod stage, so it must no-op for every
// other service: SERVICE_CONTEXT is the build's BUILD_CONTEXT (e.g.
// "packages/dota"). Only "packages/steam" is health-probed here.
//
// Exit 0 = healthy, 1 = unhealthy. Unhealthy when: snapshot missing, stale (app
// tick stopped → process wedged), or GC reported not-ready. Docker surfaces this
// as `unhealthy` for visibility/alerting; the app itself is what auto-restarts
// (process.exit(1) once the GC is dead past its ceiling).

import { readFileSync } from 'node:fs'

const service = process.env.SERVICE_CONTEXT ?? ''
if (!service.endsWith('steam')) process.exit(0)

// Matches steam.ts: VOLUME_DIR/gc-health.json, resolved against the /app WORKDIR.
const HEALTH_PATH = './src/steam/volumes/gc-health.json'
// Generous vs the app's 15s tick: only a truly stuck process misses this.
const STALE_MS = 90_000

try {
  const snap = JSON.parse(readFileSync(HEALTH_PATH, 'utf8'))
  const age = Date.now() - (snap.updatedAt ?? 0)
  if (age > STALE_MS) {
    console.error(`gc-health stale by ${Math.round(age / 1000)}s`)
    process.exit(1)
  }
  if (!snap.gcReady) {
    console.error('gc not ready')
    process.exit(1)
  }
  process.exit(0)
} catch (e) {
  console.error(`gc-health unreadable: ${e?.message ?? e}`)
  process.exit(1)
}
