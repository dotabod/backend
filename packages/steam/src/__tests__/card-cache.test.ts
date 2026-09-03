import { describe, expect, it } from 'vite-plus/test'
import { shouldRefreshCard } from '../cardCache.ts'

describe('shouldRefreshCard', () => {
  it('refreshes missing, invalid, forced, and expired profile cards', () => {
    const now = Date.parse('2026-09-03T22:00:00Z')
    const fresh = { rank_tier: 80, lifetime_games: 17_003, createdAt: new Date(now - 60_000) }
    const stale = {
      rank_tier: 80,
      lifetime_games: 17_003,
      createdAt: new Date(now - 11 * 60_000),
    }

    expect(shouldRefreshCard(undefined, false, now)).toBe(true)
    expect(shouldRefreshCard({ ...fresh, rank_tier: Number.NaN }, false, now)).toBe(true)
    expect(shouldRefreshCard(fresh, true, now)).toBe(true)
    expect(shouldRefreshCard(stale, false, now)).toBe(true)
    expect(shouldRefreshCard(fresh, false, now)).toBe(false)
  })
})
