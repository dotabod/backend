import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

import Dota from './index.js'

const mongo = Mongo.getInstance()

export default async function lastgame(steam32Id: number) {
  const db = await mongo.db
  const channelQuery = { accounts: [steam32Id] }
  const game = await Dota.findGame(channelQuery)

  if (!game._id) throw new CustomError("Game wasn't found")

  const gameHistory = await db
    .collection('gameHistory')
    .find(
      {
        'players.account_id': {
          $in: channelQuery.accounts,
        },
      },
      { sort: { createdAt: -1 }, limit: 2 },
    )
    .toArray()
  if (!gameHistory.length) throw new CustomError("Game wasn't found")
  // eslint-disable-next-line prefer-const
  let [currentGame, oldGame] = gameHistory
  if (!oldGame._id) throw new CustomError("Game wasn't found")
  const playersFromLastGame = []
  for (const [i, currentGamePlayer] of currentGame.players.entries()) {
    if (
      !channelQuery.accounts.some((account: number) => account === currentGamePlayer.account_id)
    ) {
      const lastGamePlayer = oldGame.players.find(
        (player: { account_id: number }) => player.account_id === currentGamePlayer.account_id,
      )
      if (lastGamePlayer) {
        playersFromLastGame.push({
          old: lastGamePlayer,
          current: currentGamePlayer,
          currentIndex: i,
          oldIndex: oldGame.players.indexOf(lastGamePlayer),
        })
      }
    }
  }

  if (!playersFromLastGame.length) {
    return 'Not playing with anyone from last game'
  }

  return playersFromLastGame
    .map(
      (player) =>
        `${getHeroNameById(player.current.hero_id)} played as ${getHeroNameById(
          player.old.hero_id,
        )}`,
    )
    .join(', ')
}
