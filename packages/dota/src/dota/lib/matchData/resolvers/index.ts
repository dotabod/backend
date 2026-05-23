// Resolver barrel — these are implementation details of `matchData`; consumers shouldn't import
// resolvers directly. They're exported here only so `MatchDataService` and tests can build chains.

export { GsiSelfResolver } from './GsiSelfResolver'
export { GsiSpectatorResolver } from './GsiSpectatorResolver'
export { ResolverChain } from './ResolverChain'

export { SourceTvResolver } from './SourceTvResolver'
export { type VisionFetcher, VisionResolver } from './VisionResolver'
