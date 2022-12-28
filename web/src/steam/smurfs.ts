import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameById } from '../dota/lib/heroes.js'

export async function smurfs(
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const { matchPlayers, cards } = await getPlayers(currentMatchId, players)

  const result: { heroName: string; lifetime_games?: number }[] = []
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    result.push({
      heroName: getHeroNameById(player.heroid, i),
      lifetime_games: cards[i]?.lifetime_games,
    })
  })
  const results = result
    .sort((a, b) => (a.lifetime_games ?? 0) - (b.lifetime_games ?? 0))
    .map((m) =>
      typeof m.lifetime_games === 'number'
        ? `${m.heroName}: ${m.lifetime_games.toLocaleString()}`
        : undefined,
    )
    .filter(Boolean)
    .join(' · ')
  return `Lifetime games: ${results || 'Unknown'}`
}
