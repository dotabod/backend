// Resolver barrel — these are implementation details of `matchData`; consumers shouldn't import
// resolvers directly. They're exported here only so `MatchDataService` and tests can build chains.

export { GsiSelfResolver } from './gsi-self-resolver'
export { GsiSpectatorResolver } from './gsi-spectator-resolver'
export { ResolverChain } from './resolver-chain'
export type { RawRoster, ResolverContext } from './roster-resolver'

export { SourceTvResolver } from './source-tv-resolver'
export { type VisionFetcher, VisionResolver } from './vision-resolver'
