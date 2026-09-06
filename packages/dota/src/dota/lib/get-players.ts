import { t } from 'i18next'

import MongoDBSingleton from '../../steam/mongo-db-singleton'
import { steamSocket } from '../../steam/ws'
import type { Cards, DelayedGames } from '../../types'
import CustomError from '../../utils/custom-error'
import { getHeroNameOrColor } from './heroes'
import { lookupRosterByMatchId } from './matchData'
import type { RosterPlayer } from './matchData'

export const getPlayers = async function getPlayers({
  locale,
  currentMatchId,
  players,
}: {
  locale: string
  currentMatchId?: string
  players?: RosterPlayer[]
}) {
  if (currentMatchId === undefined || currentMatchId.length === 0) {
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

    const hasProvidedPlayers = players !== undefined && players.length > 0
    if (response === null && !hasProvidedPlayers) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    // Use pre-supplied players when the caller already resolved them; otherwise look up
    // the historical roster from the delayedGames doc.
    const { matchPlayers, accountIds } = hasProvidedPlayers
      ? { accountIds: players.map((p) => p.accountId ?? 0), matchPlayers: players }
      : await lookupRosterByMatchId(currentMatchId)

    let cards: Cards[] = []
    // if match players has ranks, create that as cards instead of fetching them:
    cards = matchPlayers.map((player, i) => ({
      account_id: player.accountId ?? 0,
      createdAt: new Date(),
      heroId: player.heroId ?? 0,
      heroName: getHeroNameOrColor(player.heroId ?? 0, i),
      leaderboard_rank: player.rank ?? 0,
      lifetime_games: 0,
      position: i,
      rank_tier: 80,
    }))

    if (cards.every((card) => card.leaderboard_rank === 0)) {
      cards = []
      const getCardsPromise = new Promise<Cards[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale })))
          // 5 second timeout
        }, 10_000)

        steamSocket.emit('getCards', accountIds, false, (err: unknown, cards: Cards[]) => {
          clearTimeout(timeoutId)
          if (err !== null && err !== undefined) {
            reject(err)
          } else {
            resolve(cards)
          }
        })
      }).catch(() => [])

      cards = await getCardsPromise
    }

    return {
      accountIds,
      average_mmr: response?.average_mmr,
      cards,
      gameMode: response !== null ? Number(response.match.game_mode) : undefined,
      matchPlayers,
    }
  } finally {
    await mongo.close()
  }
}
