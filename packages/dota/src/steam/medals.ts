import { t } from 'i18next'

import { calculateAvg } from '../dota/lib/calculateAvg'
import { ranks } from '../dota/lib/consts'
import { getPlayers } from '../dota/lib/getPlayers'
import { getHeroNameOrColor } from '../dota/lib/heroes'
import type { RosterPlayer } from '../dota/lib/matchData'
import type { Medals } from '../types'
import MongoDBSingleton from './MongoDBSingleton'

export async function gameMedals(
  locale: string,
  currentMatchId?: string,
  players?: RosterPlayer[],
): Promise<string> {
  const { matchPlayers, cards } = await getPlayers({ locale, currentMatchId, players })

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const medalQuery = await db
      .collection<Medals>('medals')
      .find({ rank_tier: { $in: cards.map((card) => card.rank_tier) } })
      .toArray()

    const medals = cards.map((card, _i) => {
      const currentMedal = medalQuery.find(
        (temporaryMedal) => temporaryMedal.rank_tier === card.rank_tier,
      )
      if (!currentMedal) return t('unknown', { lng: locale })
      if (card.leaderboard_rank > 0) return `#${card.leaderboard_rank}`
      return currentMedal.name
    })

    const result: { heroNames: string; medal: string }[] = []
    const medalsToPlayers: Record<string, string[]> = {}
    matchPlayers.forEach((player, i: number) => {
      const heroName = getHeroNameOrColor(player.heroId ?? 0, i)
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
        return Number.parseInt(b.substring(1), 10) - Number.parseInt(a.substring(1), 10)
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
      result.push({ heroNames: medalsToPlayers[medal].join(', '), medal: medal || '?' })
    })

    const gms = result.map((m) => `${m.heroNames}: ${m.medal}`).join(' · ')
    return `[${avg} avg] ${gms}`
  } finally {
    await mongo.close()
  }
}
