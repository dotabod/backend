import { medals } from '../../prisma/generated/mongoclient/index.js'
import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

export async function gameMedals(
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const { matchPlayers, cards } = await getPlayers(currentMatchId, players)

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
