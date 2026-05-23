import type { HeroesStatus, Packet, Players } from '../../../../types'
import type { RosterSource } from '../types'

// Input passed to every resolver. Each resolver only needs the bits it cares about; the chain
// constructs this once and passes it down.
export interface ResolverContext {
  gsi: Packet | undefined
  matchId: string | undefined
}

// What a resolver returns when it claims the data. The legacy `Players` shape is preserved at this
// layer so that `internal/normalize.ts` can do the single sentinel/NaN/coverage pass downstream.
export interface RawRoster {
  source: RosterSource
  matchPlayers: Players
  heroesStatus?: HeroesStatus
}

// One subclass per data source. Each subclass:
//   - declares its own `source` tag (no inference downstream)
//   - returns RawRoster if it claims responsibility, or null to defer to the next resolver
// The chain (`ResolverChain`) tries resolvers in priority order and stops at the first non-null.
export abstract class RosterResolver {
  abstract readonly name: RosterSource | 'vision' // 'vision' covers heroes + draft
  abstract resolve(ctx: ResolverContext): Promise<RawRoster | null>
}
