import MongoDBSingleton from '../../steam/MongoDBSingleton'
import type { DelayedGames, HeroesStatus, Packet, Players } from '../../types'
import {
  GsiSelfResolver,
  GsiSpectatorResolver,
  ResolverChain,
  SourceTvResolver,
  VisionResolver,
} from './matchData/resolvers'

// Phase B adapter. Preserves the legacy `{ matchPlayers, accountIds, heroesStatus? }` shape so
// every existing caller keeps working, but internally delegates to the same `ResolverChain` that
// `MatchDataService` uses. Each invocation builds a fresh chain — no memoization, matching the
// previous stateless behavior. New code should prefer `MatchDataService` (per-instance dedup of
// Mongo / Vision / cards I/O) or one of its projections like `mds.getAccountIds()`.

async function fetchDelayedGameDoc(matchId: string): Promise<DelayedGames | null> {
  const mongo = MongoDBSingleton
  const db = await mongo.connect()
  try {
    return await db.collection<DelayedGames>('delayedGames').findOne({ 'match.match_id': matchId })
  } finally {
    await mongo.close()
  }
}

export async function getAccountsFromMatch({
  gsi,
  searchMatchId,
  searchPlayers,
}: {
  gsi?: Packet
  searchMatchId?: string
  searchPlayers?: Players
} = {}): Promise<{
  matchPlayers: Players
  accountIds: number[]
  heroesStatus?: HeroesStatus
}> {
  // Pre-supplied roster short-circuit. Used by `getPlayers.ts` when the caller already has the
  // player list from elsewhere and just needs the standard return shape.
  if (searchPlayers?.length) {
    return {
      matchPlayers: searchPlayers,
      accountIds: searchPlayers.map((p) => p.accountid),
    }
  }

  const matchId = searchMatchId || gsi?.map?.matchid
  const chain = new ResolverChain([
    new GsiSpectatorResolver(),
    new SourceTvResolver(fetchDelayedGameDoc),
    new VisionResolver(),
    new GsiSelfResolver(),
  ])
  const raw = await chain.resolve({ gsi, matchId })

  if (!raw) {
    return { matchPlayers: [], accountIds: [] }
  }

  // Per-source accountIds derivation matches the legacy branches:
  //   - vision-heroes drops 0s (Vision API populates accountid=0 for non-self players)
  //   - vision-draft has no accountIds (draft names only)
  //   - everything else passes through Number()
  const accountIds: number[] =
    raw.source === 'vision-heroes'
      ? raw.matchPlayers.map((p) => Number(p.accountid)).filter((id) => id !== 0)
      : raw.source === 'vision-draft'
        ? []
        : raw.matchPlayers.map((p) => Number(p.accountid))

  return raw.heroesStatus !== undefined
    ? { matchPlayers: raw.matchPlayers, accountIds, heroesStatus: raw.heroesStatus }
    : { matchPlayers: raw.matchPlayers, accountIds }
}
