import { extractPlayersFromMongoDoc, fetchDelayedGameDoc } from './internal/mongoDoc'
import { normalize } from './internal/normalize'
import type { RosterPlayer } from './types'

// Stateless lookup: fetches the `delayedGames` doc for an arbitrary match_id and returns its
// roster as `RosterPlayer[]`. For HISTORICAL match lookups only (no live GSI context). Used by
// `lastgame` (comparing the current match to a previous one) and `getPlayers` (fallback when the
// caller didn't pre-supply a roster). Live-match callers should use `MatchDataService`.
export async function lookupRosterByMatchId(
  matchId: string,
): Promise<{ matchPlayers: RosterPlayer[]; accountIds: number[] }> {
  const doc = await fetchDelayedGameDoc(matchId)
  const legacy = extractPlayersFromMongoDoc(doc)
  const { players } = normalize({
    source: 'sourcetv',
    matchPlayers: legacy,
    heroesStatus: undefined,
    gsi: undefined,
  })
  // Preserve legacy semantics: include a 0 entry for slots without a known account id, so
  // downstream callers can do `accountIds.some((id) => id !== 0)` to detect draft-only rosters.
  const accountIds = players.map((p) => p.accountId ?? 0)
  return { matchPlayers: players, accountIds }
}
