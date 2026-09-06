import type { Hero, Packet, Player, Players } from '../../types'

const collectTeamPlayers = function collectTeamPlayers(
  heroTeam: Record<string, Hero>,
  playerTeam?: Record<string, Player>
): (Players[number] & { selected: boolean })[] {
  const playerEntries = Object.entries(playerTeam ?? {})

  return Object.entries(heroTeam).map(([playerKey, hero]) => {
    const player = playerEntries.find(([candidateKey]) => candidateKey === playerKey)?.[1]
    return {
      accountid: Number(player?.accountid),
      heroid: hero.id,
      playerid: Number(playerKey.replace('player', '')),
      selected: hero.selected_unit === true,
    }
  })
}

export const getSpectatorPlayers = function getSpectatorPlayers(gsi?: Packet) {
  let matchPlayers: (Players[number] & { selected: boolean })[] = []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...collectTeamPlayers(gsi.hero.team2, gsi.player?.team2),
      ...collectTeamPlayers(gsi.hero.team3, gsi.player?.team3),
    ]
  }

  return matchPlayers
}
