import type { Packet, Team2PlayerId, Team3PlayerId } from '../types/index'

interface SpectatorPlayer {
  accountid: number
  heroid: number
  selected: boolean
}

const TEAM_TWO_PLAYER_IDS = [
  'player0',
  'player1',
  'player2',
  'player3',
  'player4',
] as const satisfies readonly Team2PlayerId[]
const TEAM_THREE_PLAYER_IDS = [
  'player5',
  'player6',
  'player7',
  'player8',
  'player9',
] as const satisfies readonly Team3PlayerId[]

export const getSpectatorPlayers = function getSpectatorPlayers(gsi?: Packet): SpectatorPlayer[] {
  const teamTwoHeroes = gsi?.hero?.team2
  const teamThreeHeroes = gsi?.hero?.team3
  const teamTwoPlayers = gsi?.player?.team2
  const teamThreePlayers = gsi?.player?.team3
  if (
    teamTwoHeroes === undefined ||
    teamThreeHeroes === undefined ||
    teamTwoPlayers === undefined ||
    teamThreePlayers === undefined
  ) {
    return []
  }

  return [
    ...TEAM_TWO_PLAYER_IDS.map((playerId) => ({
      accountid: Number(teamTwoPlayers[playerId].accountid),
      heroid: teamTwoHeroes[playerId].id,
      selected: teamTwoHeroes[playerId].selected_unit === true,
    })),
    ...TEAM_THREE_PLAYER_IDS.map((playerId) => ({
      accountid: Number(teamThreePlayers[playerId].accountid),
      heroid: teamThreeHeroes[playerId].id,
      selected: teamThreeHeroes[playerId].selected_unit === true,
    })),
  ]
}
