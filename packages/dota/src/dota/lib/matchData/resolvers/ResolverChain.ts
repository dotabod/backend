import type { RawRoster, ResolverContext, RosterResolver } from './RosterResolver'

// Tries resolvers in priority order and returns the first non-null result. No fall-through after
// a match. Order is the only thing that determines priority — there's no scoring or voting.
export class ResolverChain {
  constructor(private readonly resolvers: readonly RosterResolver[]) {}

  async resolve(ctx: ResolverContext): Promise<RawRoster | null> {
    for (const r of this.resolvers) {
      const result = await r.resolve(ctx)
      if (result) return result
    }
    return null
  }
}
