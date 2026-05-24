import MongoDBSingleton from '../../../../steam/MongoDBSingleton'
import type { DelayedGames, Players } from '../../../../types'

// Single source of truth for reading the `delayedGames` doc by match_id. Used by both
// `SourceTvResolver` and `MatchDataService.getDelayedGameDoc`.
export async function fetchDelayedGameDoc(matchId: string): Promise<DelayedGames | null> {
  const mongo = MongoDBSingleton
  const db = await mongo.connect()
  try {
    return await db.collection<DelayedGames>('delayedGames').findOne({ 'match.match_id': matchId })
  } finally {
    await mongo.close()
  }
}

// Extract a flat `Players[]` from whichever shape the Mongo doc happens to be in:
//   - `teams[]` (GetRealTimeStats writer, currently dormant) → 2 teams × 5 players
//   - flat `players[]` (SourceTV writer — the only active one today) → up to 10 entries
// Returns [] if neither shape applies.
export function extractPlayersFromMongoDoc(doc: DelayedGames | null): Players {
  if (!doc) return []
  const hasTwoTeams = Array.isArray(doc.teams) && doc.teams.length === 2

  if (!hasTwoTeams && Array.isArray(doc.teams)) {
    const out: Players = []
    for (const team of doc.teams) {
      if (!Array.isArray(team?.players)) continue
      for (const p of team.players) {
        out.push({ heroid: p.heroid, accountid: Number(p.accountid), playerid: null })
      }
    }
    return out
  }

  if (hasTwoTeams) {
    const flat: Players = []
    for (const team of doc.teams) {
      for (const a of team.players) {
        flat.push({
          heroid:
            a.heroid ||
            doc.players?.find((p) => Number(p.accountid) === Number(a.accountid))?.heroid,
          accountid: Number(a.accountid),
          playerid: a.playerid,
        })
      }
    }
    return flat
  }

  if (Array.isArray(doc.players) && doc.players.length > 0) {
    return doc.players.map((a) => ({
      heroid: a.heroid,
      accountid: Number(a.accountid),
      playerid: null,
    }))
  }

  return []
}
