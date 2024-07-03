import type { Long } from 'mongodb'

export interface SteamMatchDetails {
  activate_time: number
  deactivate_time: number
  server_steam_id: Long
  lobby_id: Long
  league_id: number
  lobby_type: number
  game_time: number
  delay: number
  spectators: number
  game_mode: number
  average_mmr: number
  match_id: Long
  series_id: number
  team_name_radiant: string | null
  team_name_dire: string | null
  sort_score: number
  last_update_time: number
  radiant_lead: number
  radiant_score: number
  dire_score: number
  players: {
    account_id: number
    hero_id: number
  }[]
  building_state: number
  custom_game_difficulty: number
}
