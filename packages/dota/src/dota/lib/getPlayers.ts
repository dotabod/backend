import { t } from 'i18next'

import MongoDBSingleton from '../../steam/MongoDBSingleton'
import { steamSocket } from '../../steam/ws'
import type { Cards, DelayedGames } from '../../types'
import CustomError from '../../utils/customError'
import { getHeroNameOrColor } from './heroes'
import { lookupRosterByMatchId, type RosterPlayer } from './matchData'

export async function getPlayers({
  locale,
  currentMatchId,
  players,
}: {
  locale: string
  currentMatchId?: string
  players?: RosterPlayer[]
}) {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const response = await db
      .collection<DelayedGames>('delayedGames')
      .findOne({ 'match.match_id': currentMatchId })

    if (!response && !players?.length) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    // Use pre-supplied players when the caller already resolved them; otherwise look up
    // the historical roster from the delayedGames doc.
    const { matchPlayers, accountIds } = players?.length
      ? { matchPlayers: players, accountIds: players.map((p) => p.accountId ?? 0) }
      : await lookupRosterByMatchId(currentMatchId)

    let cards: Cards[] = []
    // if match players has ranks, create that as cards instead of fetching them:
    cards = matchPlayers.map((player, i) => ({
      account_id: player.accountId ?? 0,
      heroId: player.heroId ?? 0,
      position: i,
      heroName: getHeroNameOrColor(player.heroId ?? 0, i),
      lifetime_games: 0,
      leaderboard_rank: player.rank ?? 0,
      rank_tier: 80,
      createdAt: new Date(),
    }))

    if (cards.every((card) => card.leaderboard_rank === 0)) {
      cards = []
      const getCardsPromise = new Promise<Cards[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale })))
        }, 10000) // 5 second timeout

        steamSocket.emit('getCards', accountIds, false, (err: unknown, cards: Cards[]) => {
          clearTimeout(timeoutId)
          if (err) {
            reject(err)
          } else {
            resolve(cards)
          }
        })
      }).catch(() => {
        return []
      })

      cards = await getCardsPromise
    }

    return {
      gameMode: response ? Number(response.match.game_mode) : undefined,
      matchPlayers,
      average_mmr: response?.average_mmr,
      accountIds,
      cards,
    }
  } finally {
    await mongo.close()
  }
}
