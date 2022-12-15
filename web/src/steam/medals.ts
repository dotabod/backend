import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const mongo = Mongo.getInstance()
const dota = Dota.getInstance()

export async function gameMedals(matchId?: string): Promise<string> {
  const db = await mongo.db

  if (!matchId) throw new CustomError("Game wasn't found")
  const response = await db.collection('delayedGames').findOne({ 'match.match_id': matchId })
  if (!response) throw new CustomError("Game wasn't found")

  const matchPlayers = [
    ...response.teams[0].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
    ...response.teams[1].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
  ]

  const cards = await dota.getCards(
    matchPlayers.map((player: { accountid: number }) => player.accountid),
  )

  const medalQuery = await db
    .collection('medals')
    .find({ rank_tier: { $in: cards.map((card) => card.rank_tier) } })
    .toArray()

  const medals: string[] = []
  for (let i = 0; i < cards.length; i += 1) {
    const currentMedal = medalQuery.find(
      (temporaryMedal) => temporaryMedal.rank_tier === cards[i].rank_tier,
    )
    if (!currentMedal) medals[i] = 'Unknown'
    else {
      medals[i] = currentMedal.name
      if (cards[i].leaderboard_rank > 0) medals[i] = `#${cards[i].leaderboard_rank}`
    }
  }
  const result: { heroName: string; medal: string }[] = []
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    result.push({ heroName: getHeroNameById(player.heroid, i), medal: medals[i] })
  })
  return result.map((m) => `${m.heroName}: ${m.medal}`).join(' · ')
}
