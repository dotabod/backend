import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { t } from 'i18next'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// !today reads getTodayHeroStats, which terminates its supabase query on
// `.order()` and resolves to `state.recentList` (see setupMocks).
type TodayMatch = { matchId: string; hero_name: string | null; won: boolean }

const setMatches = (matches: TodayMatch[]) => {
  state.recentList = matches
}

const match = (hero_name: string, won: boolean, matchId = '1'): TodayMatch => ({
  matchId,
  hero_name,
  won,
})

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('!today', () => {
  it('keeps a one-day query when the WL counter uses a 30-day window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T18:45:00.000Z'))

    await commandHandler.handleMessage(
      makeMessage({
        content: '!today',
        clientOverrides: { settings: [{ key: 'wlStatsDays', value: 30 }] },
      }),
    )

    expect(state.gteCalls).toContainEqual({
      column: 'created_at',
      value: '2026-09-04T00:00:00.000Z',
    })
  })

  it('reports noGames when no resolved matches exist today', async () => {
    setMatches([])
    await commandHandler.handleMessage(makeMessage({ content: '!today' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('today.noGames', { lng: 'en' }))
  })

  it('collapses to a single hero line when only one hero played', async () => {
    setMatches([match('npc_dota_hero_lina', false)])
    await commandHandler.handleMessage(makeMessage({ content: '!today' }))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('today.single', { lng: 'en', heroName: 'Lina', wins: 0, losses: 1 }),
    )
    // The redundant summary (e.g. "0W 1L (1 game)") must not be appended.
    expect(state.chatSayCalls[0].message).not.toContain('·')
    expect(state.chatSayCalls[0].message).not.toContain('game')
  })

  it('collapses to one line for a single hero across multiple games', async () => {
    setMatches([
      match('npc_dota_hero_lina', true),
      match('npc_dota_hero_lina', false),
      match('npc_dota_hero_lina', true),
    ])
    await commandHandler.handleMessage(makeMessage({ content: '!today' }))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('today.single', { lng: 'en', heroName: 'Lina', wins: 2, losses: 1 }),
    )
  })

  it('shows the per-hero breakdown plus an aggregate summary for multiple heroes', async () => {
    setMatches([
      match('npc_dota_hero_lina', true),
      match('npc_dota_hero_pudge', false),
      match('npc_dota_hero_lina', false),
      match('npc_dota_hero_lina', true),
    ])
    await commandHandler.handleMessage(makeMessage({ content: '!today' }))

    expect(state.chatSayCalls).toHaveLength(1)
    const summary = t('today.summary', { lng: 'en', count: 4, wins: 2, losses: 2, total: 4 })
    expect(state.chatSayCalls[0].message).toBe(`Lina 2W 1L | Pudge 1L · ${summary}`)
  })
})
