import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDbState } from './db-mocks.ts'

const { getTodayHeroStats } = await import('../get-today-hero-stats')

describe('getTodayHeroStats', () => {
  beforeEach(() => {
    resetDbState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty array when no token is provided', async () => {
    const res = await getTodayHeroStats({ token: '' })
    expect(res).toStrictEqual([])
  })

  it('returns an empty array when supabase returns no matches', async () => {
    dbState.tableResults.matches = { data: [], error: null }
    const res = await getTodayHeroStats({ token: 'tok-1' })
    expect(res).toStrictEqual([])
  })

  it('returns an empty array on supabase error', async () => {
    dbState.tableResults.matches = { data: null, error: { message: 'boom' } }
    const res = await getTodayHeroStats({ token: 'tok-1' })
    expect(res).toStrictEqual([])
  })

  it('groups wins/losses by hero and preserves first-appearance order', async () => {
    dbState.tableResults.matches = {
      data: [
        { hero_name: 'npc_dota_hero_lina', won: true },
        { hero_name: 'npc_dota_hero_pudge', won: false },
        { hero_name: 'npc_dota_hero_lina', won: false },
        { hero_name: 'npc_dota_hero_lina', won: true },
      ],
      error: null,
    }
    const res = await getTodayHeroStats({ token: 'tok-1' })

    expect(res).toHaveLength(2)
    // Lina appeared first → stays first.
    expect(res[0].heroName).toBe('Lina')
    expect(res[0].wins).toBe(2)
    expect(res[0].losses).toBe(1)
    expect(res[1].heroName).toBe('Pudge')
    expect(res[1].wins).toBe(0)
    expect(res[1].losses).toBe(1)
  })

  it('always queries one day even when the WL counter is configured for longer', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T18:45:00.000Z'))
    dbState.tableResults.matches = { data: [], error: null }

    await getTodayHeroStats({ token: 'tok-1' })

    expect(dbState.gteCalls).toContainEqual({
      column: 'created_at',
      table: 'matches',
      value: '2026-09-04T00:00:00.000Z',
    })
  })
})
