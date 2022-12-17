import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const dota = Dota.getInstance()
const mongo = Mongo.getInstance()

export async function smurfs(
  matchId?: string,
  players?: { heroid?: number; accountid?: number }[],
): Promise<string> {
  const db = await mongo.db

  if (!matchId) throw new CustomError("Game wasn't found")
  const response =
    !players?.length && (await db.collection('delayedGames').findOne({ 'match.match_id': matchId }))
  if (!response && !players?.length) throw new CustomError("Game wasn't found")

  const matchPlayers = players?.length
    ? players
    : response
    ? [
        ...response.teams[0].players.map((a: any) => ({
          heroid: a.heroid,
          accountid: a.accountid,
        })),
        ...response.teams[1].players.map((a: any) => ({
          heroid: a.heroid,
          accountid: a.accountid,
        })),
      ]
    : []

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
