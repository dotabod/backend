import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDbState } from './dbMocks.ts'

const { getWL } = await import('../getWL')

describe('getWL', () => {
  beforeEach(() => {
    resetDbState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the empty-record result when channelId is missing', async () => {
    const res = await getWL({
      channelId: '',
      lng: 'en',
      mmrEnabled: false as const,
    })

    expect(res.msg).toBeNull()
    expect(res.record).toStrictEqual([{ lose: 0, type: 'U', win: 0 }])
  })

  it('formats ranked-only results with W and L counts', async () => {
    dbState.rpcResult = {
      data: [
        { _count_won: 3, is_doubledown: false, is_party: false, lobby_type: 7, won: true },
        { _count_won: 1, is_doubledown: false, is_party: false, lobby_type: 7, won: false },
      ],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
    })

    expect(res.msg).toContain('3 W')
    expect(res.msg).toContain('1 L')
    expect(res.msg).not.toContain('MMR')
  })

  it('adds dated manual corrections to the same ranked and unranked totals', async () => {
    dbState.rpcResult = {
      data: [
        { _count_won: 3, is_doubledown: false, is_party: false, lobby_type: 7, won: true },
        { _count_won: 2, is_doubledown: false, is_party: false, lobby_type: 0, won: false },
      ],
      error: null,
    }
    dbState.tableResults.win_loss_adjustments = {
      data: [
        { delta: 1, lobby_type: 7, won: true },
        { delta: -1, lobby_type: 0, won: false },
      ],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false,
      settings: [{ key: 'wlStatsDays', value: 30 }],
      userId: 'user-1',
    })

    expect(res.record).toStrictEqual([
      { lose: 0, type: 'R', win: 4 },
      { lose: 1, type: 'U', win: 0 },
    ])
    expect(dbState.gteCalls).toContainEqual({
      column: 'created_at',
      table: 'win_loss_adjustments',
      value: expect.any(String),
    })
  })

  it('does not treat manual ranked corrections as an MMR change', async () => {
    dbState.rpcResult = {
      data: [{ _count_won: 1, is_doubledown: false, is_party: false, lobby_type: 7, won: true }],
      error: null,
    }
    dbState.tableResults.win_loss_adjustments = {
      data: [{ delta: 1, lobby_type: 7, won: true }],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: true,
      userId: 'user-1',
    })

    expect(res.msg).toContain('2 W')
    expect(res.msg).toContain('+25 MMR')
  })

  it('never displays a negative total after a manual subtraction', async () => {
    dbState.tableResults.win_loss_adjustments = {
      data: [{ delta: -1, lobby_type: 7, won: true }],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false,
      userId: 'user-1',
    })

    expect(res.record).toStrictEqual([{ lose: 0, type: 'U', win: 0 }])
    expect(res.msg).toBe('0 W - 0 L · This stream')
  })

  it('states the configured stats window in the command response', async () => {
    dbState.rpcResult = {
      data: [{ _count_won: 3, is_doubledown: false, is_party: false, lobby_type: 7, won: true }],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 30 }],
    })

    expect(res.msg).toMatch(/\u00B7 Last 30 days$/)
    expect(res.statsDays).toBe(30)
  })

  it('counts a fixed challenge from its configured start date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
    dbState.rpcResult = {
      data: [{ _count_won: 3, is_doubledown: false, is_party: false, lobby_type: 7, won: true }],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false,
      settings: [
        { key: 'wlStatsDays', value: 30 },
        { key: 'wlStatsStartDate', value: '2026-08-21' },
      ],
      userId: 'user-1',
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-08-21T00:00:00.000Z')
    expect(res.msg).toMatch(/\u00B7 14 of 30 days$/)
    expect(res.statsDays).toBe(14)
    expect(res.statsDaysTotal).toBe(30)
  })

  it('returns to per-stream stats and clears a completed challenge', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'))

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false,
      settings: [
        { key: 'wlStatsDays', value: 30 },
        { key: 'wlStatsStartDate', value: '2026-08-21' },
      ],
      streamStartDate: new Date('2026-09-20T08:00:00.000Z'),
      userId: 'user-1',
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-20T08:00:00.000Z')
    expect(res.statsDays).toBeNull()
    expect(res.statsDaysTotal).toBeNull()
    expect(dbState.upserts).toContainEqual({
      options: { onConflict: 'userId, key' },
      table: 'settings',
      values: [
        expect.objectContaining({ key: 'wlStatsDays', userId: 'user-1', value: null }),
        expect.objectContaining({ key: 'wlStatsStartDate', userId: 'user-1', value: null }),
      ],
    })
  })

  it('states that the default stats window is the current stream', async () => {
    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(res.msg).toMatch(/\u00B7 This stream$/)
    expect(res.statsDays).toBeNull()
  })

  it('defaults the WL counter to the supplied stream session', async () => {
    await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-04T08:00:00.000Z')
  })

  it('keeps one day as an explicit rolling window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 1 }],
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-03T12:00:00.000Z')
    expect(res.msg).toMatch(/\u00B7 Last 1 day$/)
    expect(res.statsDays).toBe(1)
  })

  it('queries the configured rolling number of days instead of the current stream', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 30 }],
    })

    expect(dbState.rpcCalls).toContainEqual({
      args: {
        channel_id: 'ch-1',
        start_date: '2026-08-05T12:00:00.000Z',
      },
      name: 'get_grouped_bets',
    })
  })

  it('uses a requested preview window without changing the saved setting', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 7 }],
      statsDaysOverride: 30,
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-08-05T12:00:00.000Z')
    expect(res.statsDays).toBe(30)
  })

  it('starts after a manual reset when it is newer than the rolling window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [
        { key: 'wlStatsDays', value: 30 },
        { key: 'wlResetAt', value: '2026-08-28T09:30:00.000Z' },
      ],
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-08-28T09:30:00.000Z')
  })

  it('starts a fresh per-stream counter after an older manual reset', async () => {
    await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
      settings: [{ key: 'wlResetAt', value: '2026-09-03T09:30:00.000Z' }],
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-04T08:00:00.000Z')
  })

  it('formats unranked-only results without an MMR delta', async () => {
    dbState.rpcResult = {
      data: [
        { _count_won: 2, is_doubledown: false, is_party: false, lobby_type: 0, won: true },
        { _count_won: 1, is_doubledown: false, is_party: false, lobby_type: 0, won: false },
      ],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
    })

    expect(res.msg).toContain('2 W')
    expect(res.msg).toContain('1 L')
  })

  it('applies the doubledown multiplier to MMR delta when mmrEnabled', async () => {
    dbState.rpcResult = {
      data: [{ _count_won: 1, is_doubledown: true, is_party: false, lobby_type: 7, won: true }],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: true,
    })

    // Solo multiplier (25) × 2 for doubledown = +50 MMR
    expect(res.msg).toContain('+50 MMR')
  })

  it('orders ranked first when currentGameIsRanked=true', async () => {
    dbState.rpcResult = {
      data: [
        { _count_won: 1, is_doubledown: false, is_party: false, lobby_type: 7, won: true },
        { _count_won: 1, is_doubledown: false, is_party: false, lobby_type: 0, won: true },
      ],
      error: null,
    }

    const res = await getWL({
      channelId: 'ch-1',
      currentGameIsRanked: true,
      lng: 'en',
      mmrEnabled: false as const,
    })

    expect(res.msg).toMatch(/^[^·]*Ranked[^·]*·[^·]*Unranked/)
  })

  it('returns the empty fallback when supabase.rpc errors', async () => {
    dbState.rpcResult = { data: null, error: { message: 'boom' } }

    const res = await getWL({
      channelId: 'ch-1',
      lng: 'en',
      mmrEnabled: false as const,
    })

    expect(res.msg).toBeNull()
    expect(res.record).toStrictEqual([{ lose: 0, type: 'U', win: 0 }])
  })
})
