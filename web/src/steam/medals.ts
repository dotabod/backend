import { delayedGames, medals } from '../../prisma/generated/mongoclient/index.js'
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
  if (!currentMatchId) {
    throw new CustomError('Not in a match PauseChamp')
  }

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

  const medalQuery = (await mongo
    .collection('medals')
    .find({ rank_tier: { $in: cards.map((card) => card.rank_tier) } })
    .toArray()) as unknown as medals[]

  const medals = cards.map((card, i) => {
    const currentMedal = medalQuery.find(
      (temporaryMedal) => temporaryMedal.rank_tier === card.rank_tier,
    )
    if (!currentMedal) return 'Unknown'
    if (card.leaderboard_rank > 0) return `#${card.leaderboard_rank}`
    return currentMedal.name
  })

  const result: { heroNames: string; medal: string }[] = []
  const medalsToPlayers: Record<string, string[]> = {}
  matchPlayers.forEach((player: { heroid: number; accountid: number }, i: number) => {
    const heroName = getHeroNameById(player.heroid, i)
    const medal = medals[i]
    if (!medalsToPlayers[medal]) {
      medalsToPlayers[medal] = [heroName]
    } else {
      medalsToPlayers[medal].push(heroName)
    }
  })

  // Sort medals by number, taking into account the # prefix
  const sortedMedals = Object.keys(medalsToPlayers).sort((a, b) => {
    const aNumber = Number(a.replace('#', ''))
    const bNumber = Number(b.replace('#', ''))
    if (aNumber && bNumber) return aNumber - bNumber
    return a.localeCompare(b)
  })

  // Build the result array, preserving the original order of the medals
  sortedMedals.forEach((medal) => {
    result.push({ heroNames: medalsToPlayers[medal].join(', '), medal })
  })

  return result
    .map((m) => {
      if (m.medal.startsWith('#') && !m.heroNames.includes(',')) {
        return `${m.heroNames} ${m.medal}`
      }

      return `${m.medal}: ${m.heroNames}`
    })
    .join(' · ')
}
