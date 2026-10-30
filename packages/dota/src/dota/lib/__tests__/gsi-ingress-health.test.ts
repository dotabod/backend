import { describe, expect, it } from 'vitest'

import { createPacketStub } from '../../../__tests__/shared-mocks'
import { isGsiFresh } from '../get-current-match-id'
import {
  createGsiIngressHealth,
  gsiIngressHealth,
  MAX_EXCUSED_DOWNTIME_MS,
} from '../gsi-ingress-health'
import type { GsiIngressHealth } from '../gsi-ingress-health'

// Feeds the tracker a steady rate for some seconds and returns the time it ended on
const runSeconds = function runSeconds(
  health: GsiIngressHealth,
  from: number,
  seconds: number,
  perSecond: number
): number {
  let now = from
  for (let second = 0; second < seconds; second += 1) {
    for (let packet = 0; packet < perSecond; packet += 1) {
      health.record()
    }
    now += 1000
    health.sample(now)
  }
  return now
}

describe(createGsiIngressHealth, () => {
  it('counts seconds with under half the usual traffic as downtime', () => {
    const health = createGsiIngressHealth(0)
    const outageStart = runSeconds(health, 0, 120, 200)
    const outageEnd = runSeconds(health, outageStart, 90, 20)
    const end = runSeconds(health, outageEnd, 30, 200)

    expect(health.downtimeBetween(outageStart - 30_000, end)).toBe(90_000)
    expect(health.downtimeBetween(outageStart + 60_000, end)).toBe(30_000)
    expect(health.downtimeBetween(outageEnd, end)).toBe(0)
  })

  it('ignores dips shorter than five seconds', () => {
    const health = createGsiIngressHealth(0)
    // Clients that resumed together after a deploy post in step, so every third second runs low
    let now = runSeconds(health, 0, 120, 200)
    now = runSeconds(health, now, 1, 30)
    now = runSeconds(health, now, 2, 200)
    now = runSeconds(health, now, 1, 30)
    now = runSeconds(health, now, 2, 200)
    now = runSeconds(health, now, 4, 0)
    now = runSeconds(health, now, 10, 200)

    expect(health.downtimeBetween(0, now)).toBe(0)
  })

  it('ignores a drop in traffic too thin to tell from a quiet hour', () => {
    const health = createGsiIngressHealth(0)
    const outageStart = runSeconds(health, 0, 120, 10)
    const end = runSeconds(health, outageStart, 90, 0)

    expect(health.downtimeBetween(0, end)).toBe(0)
  })

  it('does not judge the ingress before it has learned the usual rate', () => {
    const health = createGsiIngressHealth(0)
    // Such as right after a deploy, before sixty seconds of traffic
    const outageStart = runSeconds(health, 0, 30, 200)
    const end = runSeconds(health, outageStart, 20, 0)

    expect(health.downtimeBetween(0, end)).toBe(0)
  })

  it('skips at most ten minutes of a long outage and then relearns the usual rate', () => {
    const health = createGsiIngressHealth(0)
    const outageStart = runSeconds(health, 0, 120, 200)
    const end = runSeconds(health, outageStart, 20 * 60, 0)

    expect(health.downtimeBetween(outageStart, end)).toBe(MAX_EXCUSED_DOWNTIME_MS)
    expect(health.downtimeBetween(outageStart + MAX_EXCUSED_DOWNTIME_MS, end)).toBe(0)
  })
})

describe(isGsiFresh, () => {
  it('keeps a streamer fresh through an ingress outage and lets them go stale after it', () => {
    const client = { gsi: createPacketStub(), gsiUpdatedAt: Date.now() }
    const outageStart = runSeconds(gsiIngressHealth, client.gsiUpdatedAt, 120, 200)
    // Their last packet is now two minutes old, which is stale in a healthy ingress
    expect(isGsiFresh(client, outageStart)).toBeFalsy()

    client.gsiUpdatedAt = outageStart
    const outageEnd = runSeconds(gsiIngressHealth, outageStart, 90, 0)
    expect(isGsiFresh(client, outageEnd)).toBeTruthy()

    const end = runSeconds(gsiIngressHealth, outageEnd, 76, 200)
    expect(isGsiFresh(client, end)).toBeFalsy()
  })
})
