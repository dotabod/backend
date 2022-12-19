import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
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
  if (gameHistory.length !== 2) throw new CustomError('No last game found')

  const [currentGame, oldGame] = gameHistory as unknown as delayedGames[]

  const { matchPlayers: newMatchPlayers } = getAccountsFromMatch(currentGame)
  const { matchPlayers: oldMatchPlayers } = getAccountsFromMatch(oldGame)

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

  let msg = 'Not playing with anyone from last game'
  if (playersFromLastGame.length) {
    msg = playersFromLastGame
      .map(
        (player, i) =>
          `${getHeroNameById(player.current.heroid)} played as ${getHeroNameById(
            player.old.heroid,
            i,
          )}`,
      )
      .join(' · ')
  }

  return `${msg}. Last game: https://www.dotabuff.com/matches/${oldGame.matchid}`
}
