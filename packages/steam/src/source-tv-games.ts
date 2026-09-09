import type { SteamMatchDetails } from './types/steam-match-details'

export interface SourceTvGamesResponse {
  game_list: SteamMatchDetails[]
  league_id: number
  specific_games: boolean
  start_game: number
}

export const isBadSourceTvGamesResponse = function isBadSourceTvGamesResponse(
  response: SourceTvGamesResponse | null
): response is null {
  return response === null
}
