import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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
      lng: 'en',
      channelId: '',
      mmrEnabled: false as const,
    })

    expect(res.msg).toBeNull()
    expect(res.record).toEqual([{ win: 0, lose: 0, type: 'U' }])
  })

  it('formats ranked-only results with W and L counts', async () => {
    dbState.rpcResult = {
      data: [
        { won: true, _count_won: 3, lobby_type: 7, is_party: false, is_doubledown: false },
        { won: false, _count_won: 1, lobby_type: 7, is_party: false, is_doubledown: false },
      ],
      error: null,
    }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
    })

    expect(res.msg).toContain('3 W')
    expect(res.msg).toContain('1 L')
    expect(res.msg).not.toContain('MMR')
  })

  it('states the configured stats window in the command response', async () => {
    dbState.rpcResult = {
      data: [{ won: true, _count_won: 3, lobby_type: 7, is_party: false, is_doubledown: false }],
      error: null,
    }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 30 }],
    })

    expect(res.msg).toMatch(/\u00b7 Last 30 days$/)
    expect(res.statsDays).toBe(30)
  })

  it('states that the default stats window is the current stream', async () => {
    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(res.msg).toMatch(/\u00b7 This stream$/)
    expect(res.statsDays).toBeNull()
  })

  it('defaults the WL counter to the supplied stream session', async () => {
    await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-04T08:00:00.000Z')
  })

  it('keeps one day as an explicit rolling window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 1 }],
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-03T12:00:00.000Z')
    expect(res.msg).toMatch(/\u00b7 Last 1 day$/)
    expect(res.statsDays).toBe(1)
  })

  it('queries the configured rolling number of days instead of the current stream', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      settings: [{ key: 'wlStatsDays', value: 30 }],
    })

    expect(dbState.rpcCalls).toContainEqual({
      name: 'get_grouped_bets',
      args: {
        channel_id: 'ch-1',
        start_date: '2026-08-05T12:00:00.000Z',
      },
    })
  })

  it('starts after a manual reset when it is newer than the rolling window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))

    await getWL({
      lng: 'en',
      channelId: 'ch-1',
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
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      settings: [{ key: 'wlResetAt', value: '2026-09-03T09:30:00.000Z' }],
      streamStartDate: new Date('2026-09-04T08:00:00.000Z'),
    })

    expect(dbState.rpcCalls[0].args.start_date).toBe('2026-09-04T08:00:00.000Z')
  })

  it('formats unranked-only results without an MMR delta', async () => {
    dbState.rpcResult = {
      data: [
        { won: true, _count_won: 2, lobby_type: 0, is_party: false, is_doubledown: false },
        { won: false, _count_won: 1, lobby_type: 0, is_party: false, is_doubledown: false },
      ],
      error: null,
    }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
    })

    expect(res.msg).toContain('2 W')
    expect(res.msg).toContain('1 L')
  })

  it('applies the doubledown multiplier to MMR delta when mmrEnabled', async () => {
    dbState.rpcResult = {
      data: [{ won: true, _count_won: 1, lobby_type: 7, is_party: false, is_doubledown: true }],
      error: null,
    }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: true,
    })

    // Solo multiplier (25) × 2 for doubledown = +50 MMR
    expect(res.msg).toContain('+50 MMR')
  })

  it('orders ranked first when currentGameIsRanked=true', async () => {
    dbState.rpcResult = {
      data: [
        { won: true, _count_won: 1, lobby_type: 7, is_party: false, is_doubledown: false },
        { won: true, _count_won: 1, lobby_type: 0, is_party: false, is_doubledown: false },
      ],
      error: null,
    }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
      currentGameIsRanked: true,
    })

    expect(res.msg).toMatch(/^[^·]*Ranked[^·]*·[^·]*Unranked/)
  })

  it('returns the empty fallback when supabase.rpc errors', async () => {
    dbState.rpcResult = { data: null, error: { message: 'boom' } }

    const res = await getWL({
      lng: 'en',
      channelId: 'ch-1',
      mmrEnabled: false as const,
    })

    expect(res.msg).toBeNull()
    expect(res.record).toEqual([{ win: 0, lose: 0, type: 'U' }])
  })
})
