import { t } from 'i18next'

import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import { steamSocket } from '../../steam/ws.js'
import type { Cards, DelayedGames } from '../../types.js'
import CustomError from '../../utils/customError.js'
import { getAccountsFromMatch } from './getAccountsFromMatch.js'

export async function getPlayers({
  locale,
  currentMatchId,
  players,
}: {
  locale: string
  currentMatchId?: string
  players?: { heroid: number; accountid: number; playerid: number }[]
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

    const getCardsPromise = new Promise<Cards[]>((resolve, reject) => {
      steamSocket.emit('getCards', accountIds, false, (err: any, cards: any) => {
        if (err) {
          reject(err)
        } else {
          resolve(cards)
        }
      })
    })

    const cards = await getCardsPromise

    return {
      gameMode: response ? Number(response.match.game_mode) : undefined,
      matchPlayers,
      accountIds,
      cards,
    }
  } finally {
    await mongo.close()
  }
}
