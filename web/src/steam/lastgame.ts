import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

const generateMessage = (
  playersFromLastGame: {
    old: {
      heroid: number
      accountid: number
    }
    current: {
      heroid: number
      accountid: number
    }
    currentIdx: number
  }[],
) => {
  if (!playersFromLastGame.length) {
    return 'Not playing with anyone from last game'
  }

  return playersFromLastGame
    .map(
      (player, oldIdx) =>
        `${getHeroNameById(player.current.heroid, player.currentIdx)} played as ${getHeroNameById(
          player.old.heroid,
          oldIdx,
        )}`,
    )
    .join(' · ')
}

export default async function lastgame(steam32Id: number, currentMatchId?: string) {
  const gameHistory = (await mongo
    .collection('delayedGames')
    .find(
      {
        'teams.players.accountid': Number(steam32Id),
      },
      { sort: { createdAt: -1 }, limit: 2 },
    )
    .toArray()) as unknown as delayedGames[]

  if (!currentMatchId) {
    const msg = 'Not in a match rn PauseChamp'
    return gameHistory[0]?.match?.match_id
      ? `${msg}. Here's last game: dotabuff.com/matches/${gameHistory[0].match.match_id}`
      : msg
  }

  if (!gameHistory.length) throw new CustomError("Game wasn't found")
  if (gameHistory.length !== 2) throw new CustomError('No last game found')

  const [currentGame, oldGame] = gameHistory as unknown as delayedGames[]

  if (currentGame.match.match_id !== currentMatchId) {
    throw new CustomError('Waiting for current match data PauseChamp')
  }

  if (!oldGame.match.match_id || oldGame.match.match_id === currentGame.match.match_id) {
    throw new CustomError('Not playing with anyone from last game')
  }

  const { matchPlayers: newMatchPlayers } = getAccountsFromMatch(currentGame)
  const { matchPlayers: oldMatchPlayers } = getAccountsFromMatch(oldGame)

  const playersFromLastGame = newMatchPlayers
    .map((currentGamePlayer, i) => {
      if (steam32Id === currentGamePlayer.accountid) {
        return null
      }

      const old = oldMatchPlayers.find((player) => player.accountid === currentGamePlayer.accountid)
      if (!old) return null

      return {
        old,
        current: currentGamePlayer,
        currentIdx: i,
      }
    })
    .flatMap((f) => f ?? [])

  const msg = generateMessage(playersFromLastGame)
  return `${msg}. Last game: dotabuff.com/matches/${oldGame.match.match_id}`
}
