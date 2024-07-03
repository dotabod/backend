export interface Player {
  account_id: number
  hero_id: number
  name?: string
  country_code?: string
  fantasy_role?: number
  team_id?: number
  team_name?: string
  team_tag?: string
  is_locked?: boolean
  is_pro?: boolean
  locked_until?: number
}
