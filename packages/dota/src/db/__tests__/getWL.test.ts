import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { dbState, resetDbState } from './dbMocks.ts'

const { getWL } = await import('../getWL')

describe('getWL', () => {
  beforeEach(() => {
    resetDbState()
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
      // Note: getWL's type says `mmrEnabled: false` but the code branches on
      // truthiness. Pass true via a cast so we exercise the MMR-delta path.
      mmrEnabled: true as unknown as false,
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
