// In-memory stand-ins for the verifier's seams, with the same semantics as the real ones:
// the store filters and orders like the SQL in match-store.ts and guards result writes
// on the expected `won`; the requester answers from a fixed table of Valve matches.
import type {
  MatchRequester,
  MatchStore,
  ValveMatch,
  VerifiableMatch,
  Verification,
} from '../match-verification.ts'

export interface StoredMatch extends VerifiableMatch {
  verification: Verification | null
  verifiedAt: string | null
}

export const createMemoryStore = function createMemoryStore(rows: VerifiableMatch[]) {
  const table = new Map<string, StoredMatch>(
    rows.map((row) => [row.id, { ...row, verification: null, verifiedAt: null }])
  )
  const store: MatchStore = {
    async loadUnverified({ createdBefore, createdFrom, limit, unresolvedOnly }) {
      await Promise.resolve()
      const isCandidate = (row: StoredMatch) => {
        if (row.verifiedAt !== null || (unresolvedOnly && row.won !== null)) {
          return false
        }
        return row.created_at >= createdFrom && row.created_at < createdBefore
      }
      return [...table.values()]
        .filter(isCandidate)
        .toSorted((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .slice(0, limit)
    },
    async markVerified(id, verification) {
      await Promise.resolve()
      const row = table.get(id)
      if (row !== undefined) {
        Object.assign(row, { verification, verifiedAt: 'now' })
      }
    },
    async writeResult(id, expectedWon, result) {
      await Promise.resolve()
      const row = table.get(id)
      if (row?.won !== expectedWon) {
        return false
      }
      Object.assign(row, {
        lobby_type: result.lobbyType,
        verification: result.verification,
        verifiedAt: 'now',
        won: result.won,
      })
      return true
    },
  }
  return { store, table }
}

export const createRequester = function createRequester(
  answers: ReadonlyMap<string, ValveMatch | Error>
) {
  const requested: string[] = []
  const request: MatchRequester = async (matchId) => {
    requested.push(matchId)
    await Promise.resolve()
    const answer = answers.get(matchId)
    if (answer instanceof Error) {
      throw answer
    }
    return answer ?? null
  }
  return { request, requested }
}

export const verifiableMatch = function verifiableMatch(
  overrides: Partial<VerifiableMatch> = {}
): VerifiableMatch {
  return {
    created_at: '2026-10-19T22:15:02.432Z',
    hero_name: 'npc_dota_hero_lion',
    id: 'row-1',
    is_party: false,
    lobby_type: null,
    matchId: '9053165578',
    myTeam: 'dire',
    predictionId: 'prediction-1',
    steam32Id: 433_314_623,
    updated_at: '2026-10-19T23:21:11.504Z',
    userId: 'user-1',
    won: null,
    ...overrides,
  }
}

// Sanitized from Valve's answer for 9053165578: the streamer's account is anonymous (0)
// on Lion (26) for dire, and dire won.
export const valveMatch = function valveMatch(overrides: Partial<ValveMatch> = {}): ValveMatch {
  return {
    dire_score: 41,
    game_mode: 22,
    lobby_type: 7,
    match_id: '9053165578',
    match_outcome: 3,
    players: [
      { account_id: 401_880_445, hero_id: 100, team_number: 0 },
      { account_id: 0, hero_id: 67, team_number: 0 },
      { account_id: 0, hero_id: 26, team_number: 1 },
      { account_id: 207_959_060, hero_id: 20, team_number: 1 },
    ],
    radiant_score: 30,
    ...overrides,
  }
}
