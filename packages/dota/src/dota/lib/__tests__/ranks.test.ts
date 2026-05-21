// Tests the pure rank-math helpers in ranks.ts. We only assert the functions
// NOT overridden by twitch/lib/__tests__/setupMocks.ts (which process-wide
// mock.module's ranks to stub getRankTitle/getRankDescription/getOpenDotaProfile).
// rankTierToMmr/mmrToRankTier/estimateMMR/getRankDetail are preserved real via
// that harness's spread, so they're stable no matter the suite run order.
import { describe, expect, it, mock } from 'bun:test'
import { buildSharedUtilsMock } from '../../../__tests__/sharedMocks.ts'

const noopLogger = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
}

// ranks.ts -> getWL imports `supabase`/`logger` from shared-utils at load time;
// these helpers never touch it at runtime, so a no-op surface is enough.
mock.module('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({ supabase: {}, logger: noopLogger }),
)

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
    expect(mmrToRankTier(100)).toBe(11) // Herald 1
    expect(mmrToRankTier(3080)).toBe(51) // Legend 1
    expect(mmrToRankTier(5000)).toBe(72) // Divine 2
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
    expect(rankTierToMmr(11)).toBe((0 + 153) / 2) // Herald 1
    expect(rankTierToMmr(15)).toBe((616 + 769) / 2) // Herald 5
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
    expect(estimateMMR(1, 'EUROPE')).toBe(15300)
    expect(estimateMMR(1, 'US EAST')).toBe(14900)
    expect(estimateMMR(1, 'BRAZIL')).toBe(14150)
  })
})

describe('getRankDetail', () => {
  it('returns null for non-positive mmr', async () => {
    expect(await getRankDetail(0)).toBeNull()
    expect(await getRankDetail(-10)).toBeNull()
  })

  it('returns rank progression details for an in-range mmr', async () => {
    const detail = await getRankDetail(100)
    expect(detail).not.toBeNull()
    const d = detail as Exclude<typeof detail, null>
    expect((d as any).myRank.title).toBe('Herald☆1')
    expect((d as any).nextMMR).toBe(154)
    expect((d as any).mmrToNextRank).toBe(54)
    expect((d as any).winsToNextRank).toBe(3) // ceil(54 / 25)
  })
})
