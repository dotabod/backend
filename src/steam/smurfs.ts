import { server } from '../dota/index.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const dota = Dota.getInstance()
const mongo = Mongo.getInstance()

export async function smurfs(steam32Id: number): Promise<string> {
  const db = await mongo.db

  const steamserverid = await server.dota.getUserSteamServer(steam32Id)
  let response = await db
    .collection('delayedGames')
    .findOne({ 'match.server_steam_id': steamserverid })

  if (!response) {
    // @ts-expect-error asdf
    response = await server.dota.getDelayedMatchData(steamserverid)
    if (!response) throw new CustomError("Game wasn't found")

    await db.collection('delayedGames').updateOne(
      {
        matchid: response.match?.match_id,
      },
      {
        $set: { ...response, createdAt: new Date() },
      },
      {
        upsert: true,
      },
    )
  }

  if (!response) throw new CustomError("Game wasn't found")
  const matchPlayers = [
    ...response.teams[0].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
    ...response.teams[1].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
  ]

  const cards = await dota.getCards(
    matchPlayers.map((player: { accountid: number }) => player.accountid),
  )

  const result: { heroName: string; lifetime_games?: number }[] = []
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    result.push({
      heroName: getHeroNameById(player.heroid, i),
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
