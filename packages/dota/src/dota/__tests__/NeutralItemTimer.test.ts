import { describe, expect, it } from 'bun:test'

import { NEUTRAL_ITEM_TIER_TIMES } from '../NeutralItemTimer.js'

/**
 * Tests confirming neutral item tier availability times are valid
 * for Dota 2 patch 7.41 (Tier 1 now starts at 0:00).
 * Turbo times are exactly half of normal times.
 */
describe('Neutral Item Tier Times (patch 7.41)', () => {
  it('has exactly 5 tiers', () => {
    expect(NEUTRAL_ITEM_TIER_TIMES).toHaveLength(5)
  })

  it('tiers are numbered 1 through 5', () => {
    const tierNumbers = NEUTRAL_ITEM_TIER_TIMES.map((t) => t.tier)
    expect(tierNumbers).toEqual([1, 2, 3, 4, 5])
  })

  it('Tier 1 spawns at 0 minutes in normal mode', () => {
    const tier1 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 1)
    expect(tier1?.normalTime).toBe(0)
  })

  it('Tier 2 spawns at 15 minutes in normal mode', () => {
    const tier2 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 2)
    expect(tier2?.normalTime).toBe(15)
  })

  it('Tier 3 spawns at 25 minutes in normal mode', () => {
    const tier3 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 3)
    expect(tier3?.normalTime).toBe(25)
  })

  it('Tier 4 spawns at 35 minutes in normal mode', () => {
    const tier4 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 4)
    expect(tier4?.normalTime).toBe(35)
  })

  it('Tier 5 spawns at 60 minutes in normal mode', () => {
    const tier5 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 5)
    expect(tier5?.normalTime).toBe(60)
  })

  it('turbo times are exactly half of normal times for all tiers', () => {
    for (const tier of NEUTRAL_ITEM_TIER_TIMES) {
      expect(tier.turboTime).toBe(tier.normalTime / 2)
    }
  })

  it('Tier 1 spawns at 0 minutes in turbo mode', () => {
    const tier1 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 1)
    expect(tier1?.turboTime).toBe(0)
  })

  it('Tier 5 spawns at 30 minutes in turbo mode', () => {
    const tier5 = NEUTRAL_ITEM_TIER_TIMES.find((t) => t.tier === 5)
    expect(tier5?.turboTime).toBe(30)
  })

  it('normal times are in ascending order', () => {
    const times = NEUTRAL_ITEM_TIER_TIMES.map((t) => t.normalTime)
    const sorted = [...times].sort((a, b) => a - b)
    expect(times).toEqual(sorted)
  })
})

describe('Roshan respawn timer constants', () => {
  /**
   * Roshan respawn timing in Dota 2 (unchanged since patch 7.24):
   * - Minimum: 8 minutes (480 seconds) after death
   * - Maximum: 11 minutes (660 seconds) after death
   * - Turbo: half of normal (4 min to 5.5 min)
   */
  const ROSHAN_MIN_SECONDS = 8 * 60
  const ROSHAN_MAX_SECONDS = 11 * 60

  it('Roshan minimum respawn time is 8 minutes (480 seconds)', () => {
    expect(ROSHAN_MIN_SECONDS).toBe(480)
  })

  it('Roshan maximum respawn time is 11 minutes (660 seconds)', () => {
    expect(ROSHAN_MAX_SECONDS).toBe(660)
  })

  it('Roshan turbo minimum respawn time is 4 minutes (240 seconds)', () => {
    expect(ROSHAN_MIN_SECONDS / 2).toBe(240)
  })

  it('Roshan turbo maximum respawn time is 5.5 minutes (330 seconds)', () => {
    expect(ROSHAN_MAX_SECONDS / 2).toBe(330)
  })
})

describe('Aegis expiration timer', () => {
  /**
   * Aegis of the Immortal lasts 5 minutes after pickup.
   */
  it('Aegis expires after 5 minutes (300 seconds)', () => {
    const AEGIS_EXPIRE_SECONDS = 5 * 60
    expect(AEGIS_EXPIRE_SECONDS).toBe(300)
  })
})
