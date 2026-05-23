import type { DelayedGames } from '../../../../types'
import { extractPlayersFromMongoDoc } from '../internal/mongoDoc'
import { type RawRoster, type ResolverContext, RosterResolver } from './RosterResolver'

// Fetcher injected by `MatchDataService` so this resolver shares the class's memoized Mongo I/O.
// Tests pass a stub directly without touching mock.module.
export type DocFetcher = (matchId: string) => Promise<DelayedGames | null>

// Reads the Mongo `delayedGames` doc and translates whichever shape it has (flat `players[]` from
// the SourceTV writer, or `teams[]` from the dormant `GetRealTimeStats` writer) into the legacy
// `Players` array. Returns null when no doc is present so the chain falls through to Vision /
// GSI-self.
export class SourceTvResolver extends RosterResolver {
  readonly name = 'sourcetv' as const
  constructor(private readonly fetchDoc: DocFetcher) {
    super()
  }

  async resolve({ matchId }: ResolverContext): Promise<RawRoster | null> {
    if (!matchId) return null
    const doc = await this.fetchDoc(matchId)
    if (!doc) return null
    const matchPlayers = extractPlayersFromMongoDoc(doc)
    if (matchPlayers.length === 0) return null
    return { source: 'sourcetv', matchPlayers }
  }
}
