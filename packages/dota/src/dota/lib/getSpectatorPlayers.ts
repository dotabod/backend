import type { Packet, Players } from '../../types.js'

export function getSpectatorPlayers(gsi?: Packet) {
  let matchPlayers: Players & { selected: boolean }[] = []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...Object.keys(gsi.hero.team2).map((playerIdx: any) => ({
        heroid: gsi.hero?.team2?.[playerIdx].id,
        accountid: Number(gsi.player?.team2?.[playerIdx].accountid),
        playerid: Number(playerIdx),
        selected: !!gsi.hero?.team2?.[playerIdx].selected_unit,
      })),
      ...Object.keys(gsi.hero.team3).map((playerIdx: any) => ({
        heroid: gsi.hero?.team3?.[playerIdx].id,
        accountid: Number(gsi.player?.team3?.[playerIdx].accountid),
        playerid: Number(playerIdx),
        selected: !!gsi.hero?.team3?.[playerIdx].selected_unit,
      })),
    ]
  }

  return matchPlayers
}
