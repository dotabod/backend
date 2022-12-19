import { Packet } from '../../types.js'

export function getCurrentMatchPlayers(gsi?: Packet) {
  let matchPlayers: { heroid: number; accountid: number }[] = []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...Object.keys(gsi.hero.team2).map((playerIdx: any) => ({
        // @ts-expect-error asdf
        heroid: gsi.hero?.team2?.[playerIdx].id,
        // @ts-expect-error asdf
        accountid: Number(gsi.player?.team2?.[playerIdx].accountid),
      })),
      ...Object.keys(gsi.hero.team3).map((playerIdx: any) => ({
        // @ts-expect-error asdf
        heroid: gsi.hero?.team3?.[playerIdx].id,
        // @ts-expect-error asdf
        accountid: Number(gsi.player?.team3?.[playerIdx].accountid),
      })),
    ]
  }

  return matchPlayers
}
