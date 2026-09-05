import { describe, expect, it } from 'vitest'

import { ResolverChain } from '../../resolvers/ResolverChain'
import { RosterResolver } from '../../resolvers/RosterResolver'
import type { RawRoster, ResolverContext } from '../../resolvers/RosterResolver'
import type { RosterSource } from '../../types'

class FakeResolver extends RosterResolver {
  public callCount = 0
  constructor(
    readonly name: RosterSource | 'vision',
    private readonly result: RawRoster | null
  ) {
    super()
  }
  async resolve(_ctx: ResolverContext): Promise<RawRoster | null> {
    this.callCount++
    return this.result
  }
}

const ctx: ResolverContext = { gsi: undefined, matchId: '12345' }

describe(ResolverChain, () => {
  it('returns null for an empty chain', async () => {
    await expect(new ResolverChain([]).resolve(ctx)).resolves.toBeNull()
  })

  it('first non-null wins; later resolvers are NOT called', async () => {
    const a = new FakeResolver('sourcetv', { matchPlayers: [], source: 'sourcetv' })
    const b = new FakeResolver('vision', { matchPlayers: [], source: 'vision-heroes' })
    const chain = new ResolverChain([a, b])
    const result = await chain.resolve(ctx)
    expect(result?.source).toBe('sourcetv')
    expect(a.callCount).toBe(1)
    expect(b.callCount).toBe(0)
  })

  it('falls through to the next resolver on null', async () => {
    const a = new FakeResolver('sourcetv', null)
    const b = new FakeResolver('vision', { matchPlayers: [], source: 'vision-heroes' })
    const result = await new ResolverChain([a, b]).resolve(ctx)
    expect(result?.source).toBe('vision-heroes')
    expect(a.callCount).toBe(1)
    expect(b.callCount).toBe(1)
  })

  it('returns null when all resolvers defer', async () => {
    const a = new FakeResolver('sourcetv', null)
    const b = new FakeResolver('vision', null)
    await expect(new ResolverChain([a, b]).resolve(ctx)).resolves.toBeNull()
  })

  it('priority is purely positional (no scoring/voting)', async () => {
    const a = new FakeResolver('gsi-spectator', { matchPlayers: [], source: 'gsi-spectator' })
    const b = new FakeResolver('sourcetv', {
      matchPlayers: [{ accountid: 1, heroid: 1, playerid: null }],
      source: 'sourcetv',
    })
    // a wins by position even though b has "richer" data
    const result = await new ResolverChain([a, b]).resolve(ctx)
    expect(result?.source).toBe('gsi-spectator')
  })
})
