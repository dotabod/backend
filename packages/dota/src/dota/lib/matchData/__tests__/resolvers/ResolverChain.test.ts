import { describe, expect, it } from 'vite-plus/test'
import { ResolverChain } from '../../resolvers/ResolverChain'
import {
  type RawRoster,
  type ResolverContext,
  RosterResolver,
} from '../../resolvers/RosterResolver'
import type { RosterSource } from '../../types'

class FakeResolver extends RosterResolver {
  public callCount = 0
  constructor(
    readonly name: RosterSource | 'vision',
    private readonly result: RawRoster | null,
  ) {
    super()
  }
  async resolve(_ctx: ResolverContext): Promise<RawRoster | null> {
    this.callCount++
    return this.result
  }
}

const ctx: ResolverContext = { gsi: undefined, matchId: '12345' }

describe('ResolverChain', () => {
  it('returns null for an empty chain', async () => {
    expect(await new ResolverChain([]).resolve(ctx)).toBeNull()
  })

  it('first non-null wins; later resolvers are NOT called', async () => {
    const a = new FakeResolver('sourcetv', { source: 'sourcetv', matchPlayers: [] })
    const b = new FakeResolver('vision', { source: 'vision-heroes', matchPlayers: [] })
    const chain = new ResolverChain([a, b])
    const result = await chain.resolve(ctx)
    expect(result?.source).toBe('sourcetv')
    expect(a.callCount).toBe(1)
    expect(b.callCount).toBe(0)
  })

  it('falls through to the next resolver on null', async () => {
    const a = new FakeResolver('sourcetv', null)
    const b = new FakeResolver('vision', { source: 'vision-heroes', matchPlayers: [] })
    const result = await new ResolverChain([a, b]).resolve(ctx)
    expect(result?.source).toBe('vision-heroes')
    expect(a.callCount).toBe(1)
    expect(b.callCount).toBe(1)
  })

  it('returns null when all resolvers defer', async () => {
    const a = new FakeResolver('sourcetv', null)
    const b = new FakeResolver('vision', null)
    expect(await new ResolverChain([a, b]).resolve(ctx)).toBeNull()
  })

  it('priority is purely positional (no scoring/voting)', async () => {
    const a = new FakeResolver('gsi-spectator', { source: 'gsi-spectator', matchPlayers: [] })
    const b = new FakeResolver('sourcetv', {
      source: 'sourcetv',
      matchPlayers: [{ heroid: 1, accountid: 1, playerid: null }],
    })
    // a wins by position even though b has "richer" data
    const result = await new ResolverChain([a, b]).resolve(ctx)
    expect(result?.source).toBe('gsi-spectator')
  })
})
