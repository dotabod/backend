import type { Players } from '../../../types'
import { fetchDelayedGameDoc } from './internal/mongoDoc'
import { extractPlayersFromMongoDoc } from './internal/mongoDoc'

// Stateless lookup: fetches the `delayedGames` doc for an arbitrary match_id and returns its
// roster in the legacy `Players` shape. For HISTORICAL match lookups only (no live GSI context).
// Used by `lastgame` (comparing the current match to a previous one) and `getPlayers` (fallback
// when the caller didn't pre-supply a roster). Live-match callers should use `MatchDataService`.
export async function lookupRosterByMatchId(
  matchId: string,
): Promise<{ matchPlayers: Players; accountIds: number[] }> {
  const doc = await fetchDelayedGameDoc(matchId)
  const matchPlayers = extractPlayersFromMongoDoc(doc)
  const accountIds = matchPlayers.map((p) => Number(p.accountid))
  return { matchPlayers, accountIds }
}
