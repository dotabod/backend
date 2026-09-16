import { logger } from '@dotabod/shared-utils'

import type { SocketClient } from '../types'
import { draftStartByMatchId, gameInProgressClipByMatchId, gsiHandlers } from './lib/consts'
import { isGsiFresh } from './lib/get-current-match-id'

export const RETENTION_TELEMETRY_INTERVAL_MS = 5 * 60 * 1000

type RetentionClient = Pick<
  SocketClient,
  'gsi' | 'gsiUpdatedAt' | 'pendingGsi' | 'pendingGsiUpdatedAt' | 'stream_online'
>

interface RetentionTelemetrySources {
  clients: Iterable<RetentionClient>
  draftStartMatches: number
  gameInProgressClipMatches: number
  memoryUsage: NodeJS.MemoryUsage
  now: number
  uptimeSeconds: number
}

export interface DotaRetentionTelemetry {
  gsiHandlers: {
    freshHandlers: number
    handlersWithoutPackets: number
    livePackets: number
    offline: number
    online: number
    pendingPackets: number
    staleHandlers: number
    total: number
  }
  matchMaps: {
    draftStart: number
    gameInProgressClip: number
  }
  memory: {
    arrayBuffersBytes: number
    externalBytes: number
    heapTotalBytes: number
    heapUsedBytes: number
    rssBytes: number
  }
  uptimeSeconds: number
}

interface RetentionTelemetryRuntime {
  collect: () => DotaRetentionTelemetry
  log: (message: string, telemetry: DotaRetentionTelemetry) => void
}

export const buildDotaRetentionTelemetry = function buildDotaRetentionTelemetry({
  clients,
  draftStartMatches,
  gameInProgressClipMatches,
  memoryUsage,
  now,
  uptimeSeconds,
}: RetentionTelemetrySources): DotaRetentionTelemetry {
  let total = 0
  let online = 0
  let livePackets = 0
  let freshHandlers = 0
  let staleHandlers = 0
  let handlersWithoutPackets = 0
  let pendingPackets = 0

  for (const client of clients) {
    total += 1
    online += client.stream_online ? 1 : 0

    if (client.gsi !== undefined) {
      livePackets += 1
    }
    if (client.pendingGsi !== undefined) {
      pendingPackets += 1
    }

    const liveUpdatedAt = client.gsiUpdatedAt ?? 0
    const pendingUpdatedAt = client.pendingGsiUpdatedAt ?? 0
    let retainedPacket = client.gsi
    let retainedUpdatedAt = liveUpdatedAt

    if (
      client.pendingGsi !== undefined &&
      (retainedPacket === undefined || pendingUpdatedAt > retainedUpdatedAt)
    ) {
      retainedPacket = client.pendingGsi
      retainedUpdatedAt = pendingUpdatedAt
    }

    if (retainedPacket === undefined) {
      handlersWithoutPackets += 1
      continue
    }

    const fresh = isGsiFresh({ gsi: retainedPacket, gsiUpdatedAt: retainedUpdatedAt }, now)
    freshHandlers += fresh ? 1 : 0
    staleHandlers += fresh ? 0 : 1
  }

  return {
    gsiHandlers: {
      freshHandlers,
      handlersWithoutPackets,
      livePackets,
      offline: total - online,
      online,
      pendingPackets,
      staleHandlers,
      total,
    },
    matchMaps: {
      draftStart: draftStartMatches,
      gameInProgressClip: gameInProgressClipMatches,
    },
    memory: {
      arrayBuffersBytes: memoryUsage.arrayBuffers,
      externalBytes: memoryUsage.external,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      rssBytes: memoryUsage.rss,
    },
    uptimeSeconds,
  }
}

const collectDotaRetentionTelemetry = function collectDotaRetentionTelemetry(
  now = Date.now()
): DotaRetentionTelemetry {
  return buildDotaRetentionTelemetry({
    clients: [...gsiHandlers.values()].map((handler) => handler.client),
    draftStartMatches: draftStartByMatchId.size,
    gameInProgressClipMatches: gameInProgressClipByMatchId.size,
    memoryUsage: process.memoryUsage(),
    now,
    uptimeSeconds: process.uptime(),
  })
}

const defaultRuntime: RetentionTelemetryRuntime = {
  collect: collectDotaRetentionTelemetry,
  log: (message, telemetry) => {
    logger.info(message, telemetry)
  },
}

export const startDotaRetentionTelemetry = function startDotaRetentionTelemetry(
  runtime: RetentionTelemetryRuntime = defaultRuntime
): () => void {
  const timer = setInterval(() => {
    runtime.log('[DOTA] Retention telemetry', runtime.collect())
  }, RETENTION_TELEMETRY_INTERVAL_MS)
  timer.unref()

  return () => {
    clearInterval(timer)
  }
}
