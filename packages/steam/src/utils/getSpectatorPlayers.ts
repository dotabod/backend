import type { Packet, Team2PlayerId, Team3PlayerId } from '../types/index.js'

export function getSpectatorPlayers(gsi?: Packet) {
  let matchPlayers: { heroid: number; accountid: number; selected: boolean }[] = []
  if (gsi?.hero?.team2 && gsi.hero.team3) {
    matchPlayers = [
      ...Object.keys(gsi.hero.team2).map((playerIdx) => {
        const key = playerIdx as Team2PlayerId
        return {
          heroid: gsi.hero!.team2![key].id,
          accountid: Number(gsi.player!.team2![key].accountid),
          selected: !!gsi.hero!.team2![key].selected_unit,
        }
      }),
      ...Object.keys(gsi.hero.team3).map((playerIdx) => {
        const key = playerIdx as Team3PlayerId
        return {
          heroid: gsi.hero!.team3![key].id,
          accountid: Number(gsi.player!.team3![key].accountid),
          selected: !!gsi.hero!.team3![key].selected_unit,
        }
      }),
    ]
  }

  return matchPlayers
}
