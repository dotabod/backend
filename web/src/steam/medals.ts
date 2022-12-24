import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Dota from './index.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()
const dota = Dota.getInstance()

export async function gameMedals(
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  if (!currentMatchId) throw new CustomError('Not in a match PauseChamp')

  const response =
    !players?.length &&
    (await mongo.collection('delayedGames').findOne({ 'match.match_id': currentMatchId }))

  if (!response && !players?.length) {
    throw new CustomError('Waiting for current match data PauseChamp')
  }

  const { matchPlayers, accountIds } = getAccountsFromMatch(
    response as unknown as delayedGames,
    players,
  )

  const cards = await dota.getCards(accountIds)

  const medalQuery = await mongo
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
  const result: { heroNames: string; medal: string }[] = []
  const medalsToPlayers: Record<string, string[]> = {}
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    medalsToPlayers[medals[i]] = [
      ...(medalsToPlayers[medals[i]] ?? []),
      getHeroNameById(player.heroid, i),
    ]
  })

  // Return Medal: heroname, heroname, heroname
  Object.entries(medalsToPlayers).forEach(([medal, heroes]) => {
    result.push({ heroNames: heroes.join(', '), medal })
  })

  return result.map((m) => `${m.medal}: ${m.heroNames}`).join(' · ')
}
