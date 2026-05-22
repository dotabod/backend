import { describe, expect, it } from 'bun:test'
import { formatTimeAgo, formatUnresolvedMatch, type UnresolvedMatch } from '../unresolvedMatches.ts'

const now = new Date('2026-05-22T12:00:00.000Z')

const baseMatch = (overrides: Partial<UnresolvedMatch> = {}): UnresolvedMatch => ({
  matchId: '8821007388',
  hero_name: 'npc_dota_hero_dark_seer',
  kda: { kills: 4, deaths: 2, assists: 7, duration: 2472 },
  radiant_score: 32,
  dire_score: 28,
  created_at: '2026-05-22T11:00:00.000Z',
  updated_at: '2026-05-22T11:45:00.000Z',
  ...overrides,
})

describe('formatTimeAgo', () => {
  it('renders minutes under an hour', () => {
    expect(formatTimeAgo(new Date('2026-05-22T11:45:00.000Z'), now)).toBe('15m ago')
  })

  it('renders hours and minutes past an hour', () => {
    expect(formatTimeAgo(new Date('2026-05-22T10:23:00.000Z'), now)).toBe('1h 37m ago')
  })

  it('renders whole hours without trailing minutes', () => {
    expect(formatTimeAgo(new Date('2026-05-22T10:00:00.000Z'), now)).toBe('2h ago')
  })

  it('clamps future timestamps to 0m', () => {
    expect(formatTimeAgo(new Date('2026-05-22T12:05:00.000Z'), now)).toBe('0m ago')
  })
})

describe('formatUnresolvedMatch', () => {
  it('includes hero, kda, score, length, and time ago when all data is present', () => {
    expect(formatUnresolvedMatch(baseMatch(), now)).toBe(
      '8821007388 (Dark Seer, 4/2/7, 32-28, 41:12, ~15m ago)',
    )
  })

  it('omits kda when it is missing', () => {
    expect(formatUnresolvedMatch(baseMatch({ kda: null }), now)).toBe(
      '8821007388 (Dark Seer, 32-28, ~15m ago)',
    )
  })

  it('omits the score when either side is missing', () => {
    expect(formatUnresolvedMatch(baseMatch({ radiant_score: null }), now)).toBe(
      '8821007388 (Dark Seer, 4/2/7, 41:12, ~15m ago)',
    )
  })

  it('omits match length when duration is missing', () => {
    const match = baseMatch({ kda: { kills: 4, deaths: 2, assists: 7 } })
    expect(formatUnresolvedMatch(match, now)).toBe('8821007388 (Dark Seer, 4/2/7, 32-28, ~15m ago)')
  })

  it('falls back to created_at when updated_at is absent', () => {
    expect(formatUnresolvedMatch(baseMatch({ updated_at: '' }), now)).toBe(
      '8821007388 (Dark Seer, 4/2/7, 32-28, 41:12, ~1h ago)',
    )
  })

  it('falls back to the raw hero name and Unknown when unrecognized', () => {
    expect(formatUnresolvedMatch(baseMatch({ hero_name: null, kda: null }), now)).toBe(
      '8821007388 (Unknown, 32-28, ~15m ago)',
    )
  })
})
