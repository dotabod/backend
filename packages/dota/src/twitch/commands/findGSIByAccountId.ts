import { Hero, Items, Packet, Player } from '../../types'

export function findSpectatorIdx(
  packet: Packet | undefined,
  heroOrAccountId: number | undefined,
): { playerIdx: string; teamIdx: string } | null {
  const teams = ['team2', 'team3']

  for (const team of teams) {
    // @ts-expect-error we can iterate by team2 and team3
    const players: Player[] = Object.values(packet?.player?.[team] ?? {})
    if (!players) continue

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      if (Number(player.accountid) === heroOrAccountId) {
        // @ts-expect-error we can iterate by team2 and team3
        return { playerIdx: Object.keys(packet?.player?.[team])[i], teamIdx: team }
      }
    }
  }

  return null
}

export function findGSIByAccountId(
  packet: Packet | undefined,
  accountId: number | undefined,
): { player: Player; items?: Items; hero: Hero } {
  const { playerIdx, teamIdx } = findSpectatorIdx(packet, accountId) ?? {}

  // @ts-expect-error we can iterate by team2 and team3
  const player = packet?.player?.[teamIdx]?.[playerIdx]
  // @ts-expect-error we can iterate by team2 and team3
  const items = packet?.items?.[teamIdx]?.[playerIdx]
  // @ts-expect-error we can iterate by team2 and team3
  const hero = packet?.hero?.[teamIdx]?.[playerIdx]

  return { player, items, hero }
}
