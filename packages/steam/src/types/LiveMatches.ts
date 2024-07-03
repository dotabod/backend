import type { Player } from './Player.js'

export interface LiveMatch {
  activate_time: number
  deactivate_time: number
  server_steam_id: string
  lobby_id: string
  league_id: number
  lobby_type: number
  game_time: number
  delay: number
  spectators: number
  game_mode: number
  average_mmr: number
  match_id: number
  series_id: number
  team_name_radiant: string
  team_name_dire: string
  team_logo_radiant: number
  team_id_radiant: number
  team_id_dire: number
  sort_score: number
  last_update_time: number
  radiant_lead: number
  radiant_score: number
  dire_score: number
  players: Player[]
  building_state: number
  weekend_tourney_tournament_id: number
  weekend_tourney_division: number
  weekend_tourney_skill_level: number
  weekend_tourney_bracket_round: number
  custom_game_difficulty: number
}
