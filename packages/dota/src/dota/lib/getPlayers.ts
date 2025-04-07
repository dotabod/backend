import { t } from 'i18next'

import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import { steamSocket } from '../../steam/ws.js'
import type { Players } from '../../types.js'
import type { Cards, DelayedGames } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { getAccountsFromMatch } from './getAccountsFromMatch.js'
import { getHeroNameOrColor } from './heroes.js'

export async function getPlayers({
  locale,
  currentMatchId,
  players,
}: {
  locale: string
  currentMatchId?: string
  players?: Players
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

    const { matchPlayers, accountIds } = await getAccountsFromMatch({
      searchMatchId: currentMatchId,
      searchPlayers: players,
    })

    let cards: Cards[] = []
    // if match players has ranks, create that as cards instead of fetching them:
    cards = matchPlayers.map((player, i) => ({
      account_id: player.accountid,
      heroId: player.heroid,
      position: i,
      heroName: getHeroNameOrColor(player.heroid ?? 0, i),
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

        steamSocket.emit('getCards', accountIds, false, (err: any, cards: any) => {
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
