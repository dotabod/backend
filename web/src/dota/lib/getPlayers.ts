import { t } from 'i18next'

import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'
import Dota from '../../steam/index.js'
import Mongo from '../../steam/mongo.js'
import CustomError from '../../utils/customError.js'
import { getAccountsFromMatch } from './getAccountsFromMatch.js'

const mongo = await Mongo.connect()
const dota = Dota.getInstance()

export async function getPlayers(
  locale: string,
  currentMatchId?: string,
  players?: { heroid: number; accountid: number }[],
): Promise<{
  matchPlayers: { heroid: number; accountid: number }[]
  accountIds: number[]
  cards: {
    id: number
    lobby_id: number
    createdAt: Date
    rank_tier: number
    leaderboard_rank: number
    lifetime_games: number
  }[]
  gameMode?: number
}> {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  const response =
    !players?.length &&
    ((await mongo
      .collection('delayedGames')
      .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames)

  if (!response && !players?.length) {
    throw new CustomError(t('missingMatchData', { lng: locale }))
  }

  const { matchPlayers, accountIds } = getAccountsFromMatch(
    response as unknown as delayedGames,
    players,
  )
  const cards = await dota.getCards(accountIds)

  return {
    gameMode: response ? response.match.game_mode : undefined,
    matchPlayers,
    accountIds,
    cards,
  }
}
