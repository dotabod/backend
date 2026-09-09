import type { SteamMatchDetails } from './types/steam-match-details'

export interface SourceTvGamesResponse {
  game_list: SteamMatchDetails[]
  league_id: number
  specific_games: boolean
  start_game: number
}

export const getPlayableSourceTvGames = function getPlayableSourceTvGames(
  response: SourceTvGamesResponse | null
): SteamMatchDetails[] {
  if (response === null) {
    throw new TypeError('Bad SourceTV response')
  }
  return response.game_list.filter((game) => game.players.length > 0)
}
