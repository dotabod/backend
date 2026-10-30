import { logger } from '@dotabod/shared-utils'

// Every streamer's GSI reaches us through the same Cloudflare tunnel. When it drops, packets stop
// arriving from everyone at once, which looks exactly like every streamer closing Dota. Seconds in
// which the whole ingress received far less than usual are tracked here so freshness checks can
// skip them, and an outage cannot clear overlays or chat commands in the middle of a match.

// Below this rate there is too little traffic to tell an outage from a quiet hour
const MIN_BASELINE_PER_SECOND = 20
// A second with less than this share of the usual traffic is outage time
const DEGRADED_SHARE = 0.5
// Weight of each healthy second in the usual rate, which averages roughly the last minute
const BASELINE_WEIGHT = 1 / 60
// Healthy seconds needed before the usual rate is trusted, for example after a deploy
const WARMUP_SAMPLES = 60
// Tunnel outages last tens of seconds. Traffic has to stay low this long before it counts, so
// one-second dips from bursty traffic, such as clients posting in step right after a deploy, do
// not. The outage is then dated from when the traffic first dropped.
const MIN_OUTAGE_MS = 5000
// The most outage time one freshness check skips. An ingress that stays down longer becomes the
// new usual rate, so a broken tunnel cannot keep hours-old game state alive.
export const MAX_EXCUSED_DOWNTIME_MS = 10 * 60 * 1000
// Once the skipped time is capped, outages older than this cannot change any freshness answer
const OUTAGE_RETENTION_MS = 2 * MAX_EXCUSED_DOWNTIME_MS

interface Outage {
  end: number
  start: number
}

export interface GsiIngressHealth {
  downtimeBetween: (from: number, to: number) => number
  record: () => void
  sample: (now: number) => void
}

export const createGsiIngressHealth = function createGsiIngressHealth(
  startedAt: number
): GsiIngressHealth {
  const outages: Outage[] = []
  let currentOutage: Outage | null = null
  let lowSince: number | null = null
  let packets = 0
  let windowStart = startedAt
  let usualPerSecond = 0
  let healthySamples = 0

  const recordHealthySecond = (perSecond: number) => {
    lowSince = null
    if (currentOutage !== null) {
      logger.info('[GSI] Ingress recovered', {
        durationMs: currentOutage.end - currentOutage.start,
      })
      currentOutage = null
    }
    usualPerSecond =
      healthySamples === 0
        ? perSecond
        : usualPerSecond + BASELINE_WEIGHT * (perSecond - usualPerSecond)
    healthySamples += 1
  }

  const recordDegradedSecond = (perSecond: number, now: number) => {
    if (lowSince === null) {
      lowSince = windowStart
    }
    if (now - lowSince < MIN_OUTAGE_MS) {
      return
    }
    if (currentOutage === null) {
      currentOutage = { end: now, start: lowSince }
      outages.push(currentOutage)
      logger.info('[GSI] Ingress degraded', {
        perSecond: Math.round(perSecond),
        usualPerSecond: Math.round(usualPerSecond),
      })
    } else {
      currentOutage.end = now
    }
    if (now - currentOutage.start >= MAX_EXCUSED_DOWNTIME_MS) {
      // Relearn the usual rate from the next second instead of excusing this outage forever
      healthySamples = 0
    }
  }

  return {
    downtimeBetween: (from, to) => {
      let downtime = 0
      for (const outage of outages) {
        downtime += Math.max(0, Math.min(outage.end, to) - Math.max(outage.start, from))
      }
      return Math.min(downtime, MAX_EXCUSED_DOWNTIME_MS)
    },
    record: () => {
      packets += 1
    },
    sample: (now) => {
      const elapsed = now - windowStart
      if (elapsed <= 0) {
        return
      }
      const perSecond = (packets * 1000) / elapsed
      const isUsualRateTrusted =
        healthySamples >= WARMUP_SAMPLES && usualPerSecond >= MIN_BASELINE_PER_SECOND
      if (isUsualRateTrusted && perSecond < usualPerSecond * DEGRADED_SHARE) {
        recordDegradedSecond(perSecond, now)
      } else {
        recordHealthySecond(perSecond)
      }
      packets = 0
      windowStart = now
      const firstRetained = outages.findIndex((outage) => outage.end >= now - OUTAGE_RETENTION_MS)
      outages.splice(0, firstRetained === -1 ? outages.length : firstRetained)
    },
  }
}

export const gsiIngressHealth = createGsiIngressHealth(Date.now())
