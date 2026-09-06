import { describe, expect, it } from 'vitest'

import { shouldRefreshCard } from '../card-cache.ts'

describe(shouldRefreshCard, () => {
  it('refreshes missing, invalid, forced, and expired profile cards', () => {
    const now = Date.parse('2026-09-03T22:00:00Z')
    const fresh = { createdAt: new Date(now - 60_000), lifetime_games: 17_003, rank_tier: 80 }
    const stale = {
      createdAt: new Date(now - 11 * 60_000),
      lifetime_games: 17_003,
      rank_tier: 80,
    }

    expect(shouldRefreshCard(undefined, false, now)).toBeTruthy()
    expect(shouldRefreshCard({ ...fresh, rank_tier: Number.NaN }, false, now)).toBeTruthy()
    expect(shouldRefreshCard(fresh, true, now)).toBeTruthy()
    expect(shouldRefreshCard(stale, false, now)).toBeTruthy()
    expect(shouldRefreshCard(fresh, false, now)).toBeFalsy()
  })
})
