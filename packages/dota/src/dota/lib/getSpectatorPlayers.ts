import type { Packet } from '../../types.js'

export function getSpectatorPlayers(gsi?: Packet) {
  let matchPlayers: { heroid: number; accountid: number; selected: boolean; playerid: number }[] =
    []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...Object.keys(gsi.hero.team2).map((playerIdx: any) => ({
        // @ts-expect-error types
        heroid: gsi.hero?.team2?.[playerIdx].id,
        // @ts-expect-error types
        accountid: Number(gsi.player?.team2?.[playerIdx].accountid),
        playerid: Number(playerIdx),
        // @ts-expect-error types
        selected: !!gsi.hero?.team2?.[playerIdx].selected_unit,
      })),
      ...Object.keys(gsi.hero.team3).map((playerIdx: any) => ({
        // @ts-expect-error types
        heroid: gsi.hero?.team3?.[playerIdx].id,
        // @ts-expect-error types
        accountid: Number(gsi.player?.team3?.[playerIdx].accountid),
        playerid: Number(playerIdx),
        // @ts-expect-error types
        selected: !!gsi.hero?.team3?.[playerIdx].selected_unit,
      })),
    ]
  }

  return matchPlayers
}
