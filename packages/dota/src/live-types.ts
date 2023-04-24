export interface Root {
  match: Match
  teams: Team[]
  buildings: Building[]
  graph_data: GraphData
}

export interface Match {
  server_steam_id: string
  match_id: string
  timestamp: number
  game_time: number
  game_mode: number
  league_id: number
  league_node_id: number
  game_state: number
  lobby_type: number
  start_timestamp: number
}

export interface Team {
  team_number: number
  team_id: number
  team_name: string
  team_tag: string
  team_logo: string
  score: number
  net_worth: number
  team_logo_url: string
  players: Player[]
}

export interface Player {
  accountid: number
  playerid: number
  name: string
  team: number
  heroid: number
  level: number
  kill_count: number
  death_count: number
  assists_count: number
  denies_count: number
  lh_count: number
  gold: number
  x: number
  y: number
  net_worth: number
  abilities: number[]
  items: number[]
}

export interface Building {
  team: number
  heading: number
  type: number
  lane: number
  tier: number
  x: number
  y: number
  destroyed: boolean
}

export interface GraphData {
  graph_gold: number[]
}
