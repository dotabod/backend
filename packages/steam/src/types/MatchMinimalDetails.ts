interface MatchPlayer {
  account_id: number
  hero_id: number
  kills: number
  deaths: number
  assists: number
  items: number[]
  player_slot: number
  pro_name: string
  level: number
  team_number: number
}

interface MatchMinimal {
  match_id: {
    low: number
    high: number
    unsigned: boolean
  }
  start_time: number
  duration: number
  game_mode: number
  match_outcome: number
  players: MatchPlayer[]
  tourney: unknown
  radiant_score: number
  dire_score: number
  lobby_type: number
}

export interface MatchMinimalDetailsResponse {
  matches: MatchMinimal[]
  last_match: unknown
}
