import { getHeroNameById } from '../dota/lib/heroes.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const mongo = Mongo.getInstance()

export interface Player {
  account_id: number
  hero_id: number
}

export async function notablePlayers(steam32Id: number): Promise<string> {
  const db = await mongo.db
  const channelQuery = { accounts: [steam32Id] }
  const game = await Dota.findGame(channelQuery, true)
  const mode = await db
    .collection('gameModes')
    .findOne({ id: game.game_mode }, { projection: { _id: 0, name: 1 } })
  const nps = await db
    .collection('notablePlayers')
    .find(
      { account_id: { $in: game.players.map((player: Player) => player.account_id) } },
      {
        projection: {
          _id: 0,
          account_id: 1,
          name: 1,
          personaname: 1,
          team_tag: 1,
          team_name: 1,
          country_code: 1,
        },
      },
    )
    .toArray()

  const result: { heroName: string; name: string }[] = []
  game.players.forEach((player: Player, i: number) => {
    const np = nps.find((np) => np.account_id === player.account_id)
    if (np) {
      result.push({ heroName: getHeroNameById(player.hero_id, i), name: np.name })
    }
  })

  const players = result.map((m) => `${m.name} (${m.heroName})`).join(' · ')

  return `${mode?.name} [${game.average_mmr} avg]: ${players || 'No notable players'}`
}
