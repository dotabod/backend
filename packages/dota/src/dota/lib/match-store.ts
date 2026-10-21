import { supabase } from '@dotabod/shared-utils'

import type { MatchStore } from './match-verification'

const VERIFIABLE_MATCH_COLUMNS =
  'id, matchId, userId, myTeam, hero_name, steam32Id, won, is_party, lobby_type, predictionId, created_at, updated_at'

export const supabaseMatchStore: MatchStore = {
  async loadUnverified({ createdBefore, createdFrom, limit, unresolvedOnly }) {
    const query = supabase
      .from('matches')
      .select(VERIFIABLE_MATCH_COLUMNS)
      .is('verified_at', null)
      .gte('created_at', createdFrom)
      .lt('created_at', createdBefore)
    const { data, error } = await (unresolvedOnly ? query.is('won', null) : query)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit)
    if (error !== null) {
      throw new Error(`Could not load matches to verify: ${error.message}`)
    }
    return data
  },

  async markVerified(id, verification) {
    await supabase
      .from('matches')
      .update({ verification, verified_at: new Date().toISOString() })
      .eq('id', id)
  },

  async writeResult(id, expectedWon, result) {
    const now = new Date().toISOString()
    const update = supabase
      .from('matches')
      .update({
        dire_score: result.direScore,
        game_mode: result.gameMode,
        lobby_type: result.lobbyType,
        radiant_score: result.radiantScore,
        updated_at: now,
        verification: result.verification,
        verified_at: now,
        won: result.won,
      })
      .eq('id', id)
    const { data, error } = await (
      expectedWon === null ? update.is('won', null) : update.eq('won', expectedWon)
    ).select('id')
    return error === null && data.length > 0
  },
}
