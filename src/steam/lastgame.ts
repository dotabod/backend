import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

const mongo = Mongo.getInstance()

export default async function lastgame(steam32Id: number) {
  const db = await mongo.db
  const gameHistory = await db
    .collection('delayedGames')
    .find(
      {
        'teams.players.accountid': steam32Id,
      },
      { sort: { createdAt: -1 }, limit: 2 },
    )
    .toArray()
  if (!gameHistory.length) throw new CustomError("Game wasn't found")
  // eslint-disable-next-line prefer-const
  let [currentGame, oldGame] = gameHistory
  if (!oldGame || !oldGame._id) throw new CustomError('No last game found')

  const oldMatchPlayers = [
    ...oldGame.teams[0].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
    ...oldGame.teams[1].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
  ]

  const newMatchPlayers = [
    ...currentGame.teams[0].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
    ...currentGame.teams[1].players.map((a: any) => ({ heroid: a.heroid, accountid: a.accountid })),
  ]

  const playersFromLastGame = []
  for (const [i, currentGamePlayer] of newMatchPlayers.entries()) {
    if (steam32Id === currentGamePlayer.accountid) {
      continue
    }

    const lastGamePlayer = oldMatchPlayers.find(
      (player: { accountid: number }) => player.accountid === currentGamePlayer.accountid,
    )

    if (lastGamePlayer) {
      playersFromLastGame.push({
        old: lastGamePlayer,
        current: currentGamePlayer,
        currentIndex: i,
        oldIndex: oldMatchPlayers.indexOf(lastGamePlayer),
      })
    }
  }

  if (!playersFromLastGame.length) {
    return 'Not playing with anyone from last game'
  }

  return playersFromLastGame
    .map(
      (player, i) =>
        `${getHeroNameById(player.current.heroid)} played as ${getHeroNameById(
          player.old.heroid,
          i,
        )}`,
    )
    .join(' · ')
}
