import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPacketStub, createSocketClientStub } from '../../__tests__/shared-mocks'
import type { DotaRetentionTelemetry } from '../retention-telemetry'
import {
  buildDotaRetentionTelemetry,
  RETENTION_TELEMETRY_INTERVAL_MS,
  startDotaRetentionTelemetry,
} from '../retention-telemetry'

const memoryUsage = {
  arrayBuffers: 6,
  external: 5,
  heapTotal: 3,
  heapUsed: 4,
  rss: 2,
}

describe('Dota retention telemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts handlers using the freshest retained live or pending packet', () => {
    const now = 1_000_000
    const telemetry = buildDotaRetentionTelemetry({
      clients: [
        createSocketClientStub({
          gsi: createPacketStub({ map: { matchid: 'fresh-match' } }),
          gsiUpdatedAt: now - 1000,
          stream_online: true,
        }),
        createSocketClientStub({
          gsi: createPacketStub({ map: { matchid: 'stale-live-match' } }),
          gsiUpdatedAt: now - 100_000,
          pendingGsi: createPacketStub({ map: { matchid: 'fresh-pending-match' } }),
          pendingGsiUpdatedAt: now - 1000,
        }),
        createSocketClientStub({
          pendingGsi: createPacketStub({ map: { matchid: 'stale-pending-match' } }),
          pendingGsiUpdatedAt: now - 100_000,
        }),
        createSocketClientStub(),
      ],
      draftStartMatches: 4,
      gameInProgressClipMatches: 5,
      memoryUsage,
      now,
      uptimeSeconds: 123.5,
    })

    expect(telemetry).toStrictEqual({
      gsiHandlers: {
        freshHandlers: 2,
        handlersWithoutPackets: 1,
        livePackets: 2,
        offline: 3,
        online: 1,
        pendingPackets: 2,
        staleHandlers: 1,
        total: 4,
      },
      matchMaps: {
        draftStart: 4,
        gameInProgressClip: 5,
      },
      memory: {
        arrayBuffersBytes: 6,
        externalBytes: 5,
        heapTotalBytes: 3,
        heapUsedBytes: 4,
        rssBytes: 2,
      },
      uptimeSeconds: 123.5,
    })
  })

  it('logs only aggregates on schedule and stops cleanly', async () => {
    const privateUserId = 'private-user-token'
    const privatePacketValue = 'private-packet-value'
    const now = 1_000_000
    const telemetry = buildDotaRetentionTelemetry({
      clients: [
        createSocketClientStub({
          gsi: createPacketStub({ map: { matchid: privatePacketValue } }),
          gsiUpdatedAt: now,
          token: privateUserId,
        }),
      ],
      draftStartMatches: 1,
      gameInProgressClipMatches: 1,
      memoryUsage,
      now,
      uptimeSeconds: 123.5,
    })
    const log = vi.fn<(message: string, value: DotaRetentionTelemetry) => void>()
    const expectedTelemetry = {
      gsiHandlers: {
        freshHandlers: 1,
        handlersWithoutPackets: 0,
        livePackets: 1,
        offline: 1,
        online: 0,
        pendingPackets: 0,
        staleHandlers: 0,
        total: 1,
      },
      matchMaps: {
        draftStart: 1,
        gameInProgressClip: 1,
      },
      memory: {
        arrayBuffersBytes: 6,
        externalBytes: 5,
        heapTotalBytes: 3,
        heapUsedBytes: 4,
        rssBytes: 2,
      },
      uptimeSeconds: 123.5,
    }
    const stop = startDotaRetentionTelemetry({ collect: () => telemetry, log })

    await vi.advanceTimersByTimeAsync(RETENTION_TELEMETRY_INTERVAL_MS - 1)
    expect(log).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(log).toHaveBeenCalledExactlyOnceWith('[DOTA] Retention telemetry', expectedTelemetry)
    const serializedLog = JSON.stringify(log.mock.calls)
    expect([
      serializedLog.includes(privateUserId),
      serializedLog.includes(privatePacketValue),
    ]).toStrictEqual([false, false])

    stop()
    await vi.advanceTimersByTimeAsync(RETENTION_TELEMETRY_INTERVAL_MS)
    expect(log).toHaveBeenCalledExactlyOnceWith('[DOTA] Retention telemetry', expectedTelemetry)
  })
})
