import { delayedGames } from '@dotabod/prisma/dist/mongo'
import { t } from 'i18next'

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
) {
  if (!currentMatchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  if (!Number(currentMatchId)) {
    throw new CustomError(t('gameNotFound', { lng: locale }))
  }

  const response = await mongo
    .collection<delayedGames>('delayedGames')
    .findOne({ 'match.match_id': currentMatchId })

  if (!response && !players?.length) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  const { matchPlayers, accountIds } = await getAccountsFromMatch({
    searchMatchId: currentMatchId,
    searchPlayers: players,
  })

  const cards = await dota.getCards(accountIds)

  return {
    gameMode: response ? Number(response.match.game_mode) : undefined,
    matchPlayers,
    accountIds,
    cards,
  }
}
