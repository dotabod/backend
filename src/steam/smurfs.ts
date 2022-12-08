import { getHeroNameById } from '../dota/lib/heroes.js'

import Dota from './index.js'

const dota = Dota.getInstance()

export async function smurfs(steam32Id: number): Promise<string> {
  const channelQuery = { accounts: [steam32Id] }
  const game = await Dota.findGame(channelQuery, true)
  const cards = await dota.getCards(
    game.players.map((player: { account_id: number }) => player.account_id),
    game.lobby_id,
  )

  const result: { heroName: string; lifetime_games?: number }[] = []
  game.players.forEach((player: { hero_id: number; account_id: number }, i: number) => {
    result.push({
      heroName: getHeroNameById(player.hero_id, i),
      lifetime_games: cards[i]?.lifetime_games,
    })
  })
  const results = result
    .map((m) =>
      typeof m.lifetime_games === 'number'
        ? `${m.heroName}: ${m.lifetime_games.toLocaleString()}`
        : undefined,
    )
    .filter(Boolean)
    .join(' · ')
  return `Lifetime games: ${results || 'Unknown'}`
}
