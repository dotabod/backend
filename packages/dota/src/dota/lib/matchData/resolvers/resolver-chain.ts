import type { RawRoster, ResolverContext, RosterResolver } from './roster-resolver'

// Tries resolvers in priority order and returns the first non-null result. No fall-through after
// a match. Order is the only thing that determines priority — there's no scoring or voting.
export class ResolverChain {
  private readonly resolvers: readonly RosterResolver[]

  constructor(resolvers: readonly RosterResolver[]) {
    this.resolvers = resolvers
  }

  async resolve(ctx: ResolverContext): Promise<RawRoster | null> {
    return await this.resolveAt(0, ctx)
  }

  private async resolveAt(index: number, ctx: ResolverContext): Promise<RawRoster | null> {
    if (index >= this.resolvers.length) {
      return null
    }
    const resolver = this.resolvers[index]
    const roster = await resolver.resolve(ctx)
    return roster ?? (await this.resolveAt(index + 1, ctx))
  }
}
