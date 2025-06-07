import type { Packet, Players } from '../../types.js'

export function getSpectatorPlayers(gsi?: Packet) {
  let matchPlayers: Players & { selected: boolean }[] = []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...Object.keys(gsi.hero.team2).map((playerIdx) => ({
        heroid: gsi.hero?.team2?.[playerIdx as keyof typeof gsi.hero.team2]?.id,
        accountid: Number(
          gsi.player?.team2?.[playerIdx as keyof typeof gsi.player.team2]?.accountid,
        ),
        playerid: Number(playerIdx),
        selected: !!gsi.hero?.team2?.[playerIdx as keyof typeof gsi.hero.team2]?.selected_unit,
      })),
      ...Object.keys(gsi.hero.team3).map((playerIdx) => ({
        heroid: gsi.hero?.team3?.[playerIdx as keyof typeof gsi.hero.team3]?.id,
        accountid: Number(
          gsi.player?.team3?.[playerIdx as keyof typeof gsi.player.team3]?.accountid,
        ),
        playerid: Number(playerIdx),
        selected: !!gsi.hero?.team3?.[playerIdx as keyof typeof gsi.hero.team3]?.selected_unit,
      })),
    ]
  }

  return matchPlayers
}
