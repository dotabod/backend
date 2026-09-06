// Tests the pure rank-math helpers in ranks.ts. We only assert the functions
// NOT overridden by twitch/lib/__tests__/setupMocks.ts (which process-wide
// mock.module's ranks to stub getRankTitle/getRankDescription/getDotabodRankProfile).
// rankTierToMmr/mmrToRankTier/estimateMMR/getRankDetail are preserved real via
// that harness's spread, so they're stable no matter the suite run order.
import { describe, expect, it, vi } from 'vitest'

import { buildSharedUtilsMock } from '../../../__tests__/shared-mocks.ts'

const noopLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

// ranks.ts -> getWL imports `supabase`/`logger` from shared-utils at load time;
// these helpers never touch it at runtime, so a no-op surface is enough.
vi.doMock('@dotabod/shared-utils', () => buildSharedUtilsMock({ logger: noopLogger, supabase: {} }))

const { rankTierToMmr, mmrToRankTier, estimateMMR, getRankDetail } = await import('../ranks.ts')

describe('mmrToRankTier', () => {
  it('returns 0 (uncalibrated) for non-positive mmr', () => {
    expect(mmrToRankTier(0)).toBe(0)
    expect(mmrToRankTier(-50)).toBe(0)
  })

  it('returns 80 (immortal) at or above the highest rank mmr', () => {
    expect(mmrToRankTier(5619)).toBe(80)
    expect(mmrToRankTier(9000)).toBe(80)
  })

  it('maps mmr into the medal*10+stars tier', () => {
    // Herald 1
    expect(mmrToRankTier(100)).toBe(11)
    // Legend 1
    expect(mmrToRankTier(3080)).toBe(51)
    // Divine 2
    expect(mmrToRankTier(5000)).toBe(72)
  })
})

describe('rankTierToMmr', () => {
  it('returns 0 for falsy / zero rank tiers', () => {
    expect(rankTierToMmr(0)).toBe(0)
    expect(rankTierToMmr('')).toBe(0)
  })

  it('returns 6000 for immortal rank tiers above 77', () => {
    expect(rankTierToMmr(80)).toBe(6000)
  })

  it('returns the midpoint of the rank range', () => {
    // Herald 1
    expect(rankTierToMmr(11)).toBe((0 + 153) / 2)
    // Herald 5
    expect(rankTierToMmr(15)).toBe((616 + 769) / 2)
  })

  it('floors stars above 5 to 5', () => {
    // rank tier 18 -> medal 1, stars capped at 5 -> same as Herald 5
    expect(rankTierToMmr(18)).toBe(rankTierToMmr(15))
  })
})

describe('estimateMMR', () => {
  it('returns 8500 for out-of-range leaderboard ranks', () => {
    expect(estimateMMR(0, 'EUROPE')).toBe(8500)
    expect(estimateMMR(5001, 'EUROPE')).toBe(8500)
  })

  it('computes region-specific base mmr (ln(1)=0 makes rank 1 the base constant)', () => {
    expect(estimateMMR(1, 'EUROPE')).toBe(15_300)
    expect(estimateMMR(1, 'US EAST')).toBe(14_900)
    expect(estimateMMR(1, 'BRAZIL')).toBe(14_150)
  })
})

describe('getRankDetail', () => {
  it('returns null for non-positive mmr', async () => {
    await expect(getRankDetail(0)).resolves.toBeNull()
    await expect(getRankDetail(-10)).resolves.toBeNull()
  })

  it('returns rank progression details for an in-range mmr', async () => {
    const detail = await getRankDetail(100)
    if (!detail || 'standing' in detail) {
      throw new Error('Expected an in-range rank detail')
    }
    expect(detail.myRank?.title).toBe('Herald☆1')
    expect(detail.nextMMR).toBe(154)
    expect(detail.mmrToNextRank).toBe(54)
    // ceil(54 / 25)
    expect(detail.winsToNextRank).toBe(3)
  })

  it('routes to the leaderboard lookup at the exact top-of-range boundary, matching mmrToRankTier(5619) === 80 (immortal)', async () => {
    const detail = await getRankDetail(5619)
    expect(detail).not.toBeNull()
    // The leaderboard-branch shape carries `standing`; the in-range shape doesn't.
    expect(detail && 'standing' in detail).toBeTruthy()
  })
})
