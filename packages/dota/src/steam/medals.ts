import { medals } from '@dotabod/prisma/dist/mongo/index.js'
import { t } from 'i18next'

import { calculateAvg } from '../dota/lib/calculateAvg.js'
import { ranks } from '../dota/lib/consts.js'
import { getPlayers } from '../dota/lib/getPlayers.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

export async function gameMedals(
  locale: string,
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<string> {
  const { matchPlayers, cards } = await getPlayers(locale, currentMatchId, players)

  const medalQuery = (await mongo
    .collection('medals')
    .find({ rank_tier: { $in: cards.map((card) => card.rank_tier) } })
    .toArray()) as unknown as medals[]

  const medals = cards.map((card, i) => {
    const currentMedal = medalQuery.find(
      (temporaryMedal) => temporaryMedal.rank_tier === card.rank_tier,
    )
    if (!currentMedal) return t('unknown', { lng: locale })
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

  // sort according to medal order
  const sortedMedals = Object.keys(medalsToPlayers).sort((a, b) => {
    if (a === 'Uncalibrated') return -1
    if (b === 'Uncalibrated') return 1

    const aIndex = ranks.findIndex((rank) => rank.title.startsWith(a))
    const bIndex = ranks.findIndex((rank) => rank.title.startsWith(b))

    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex
    }

    if (aIndex !== -1) {
      return -1
    }
    if (bIndex !== -1) {
      return 1
    }

    if (a === 'Immortal') {
      return -1
    }
    if (b === 'Immortal') {
      return 1
    }

    if (a.startsWith('#') || b.startsWith('#')) {
      return parseInt(b.substring(1)) - parseInt(a.substring(1))
    }

    return 0
  })

  const avg = await calculateAvg({
    locale: locale,
    currentMatchId: currentMatchId,
    players: players,
  })

  // Build the result array, preserving the original order of the medals
  sortedMedals.forEach((medal) => {
    result.push({ heroNames: medalsToPlayers[medal].join(', '), medal })
  })

  const gms = result.map((m) => `${m.heroNames}: ${m.medal}`).join(' · ')
  return `[${avg} avg] ${gms}`
}
