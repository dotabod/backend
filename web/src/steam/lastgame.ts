import { t } from 'i18next'

import { delayedGames } from '../../prisma/generated/mongoclient/index.js'
import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import Mongo from './mongo.js'

const mongo = await Mongo.connect()

const generateMessage = (
  locale: string,
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
    return t('lastgame.none', { lng: locale })
  }

  return playersFromLastGame
    .map((player, oldIdx) =>
      t('lastgame.player', {
        lng: locale,
        currentMatchHero: getHeroNameById(player.current.heroid, player.currentIdx),
        lastMatchHero: getHeroNameById(player.old.heroid, oldIdx),
      }),
    )
    .join(' · ')
}

interface LastgameParams {
  locale: string
  steam32Id: number
  currentMatchId?: string
  currentPlayers?: { heroid: number; accountid: number }[]
}

export default async function lastgame({
  locale,
  steam32Id,
  currentMatchId,
  currentPlayers,
}: LastgameParams) {
  const gameHistory = (await mongo
    .collection('delayedGames')
    .find(
      {
        'teams.players.accountid': Number(steam32Id),
      },
      { sort: { createdAt: -1 }, limit: 2 },
    )
    .toArray()) as unknown as delayedGames[]

  if (!Number(currentMatchId)) {
    const msg = !currentMatchId
      ? t('notPlaying', { lng: locale })
      : t('gameNotFound', { lng: locale })
    return gameHistory[0]?.match?.match_id
      ? `${msg}. ${t('lastgame.link', {
          lng: locale,
          url: `dotabuff.com/matches/${gameHistory[0].match.match_id}`,
        })}`
      : msg
  }

  if (!gameHistory.length) throw new CustomError(t('noLastMatch', { lng: locale }))
  if (gameHistory.length !== 2) throw new CustomError(t('noLastMatch', { lng: locale }))

  const [gameOne, gameTwo] = gameHistory as unknown as delayedGames[]
  const oldGame = gameOne.match.match_id === currentMatchId ? gameTwo : gameOne

  if (!currentPlayers?.length) {
    throw new CustomError(t('missingMatchData', { lng: locale }))
  }

  if (!Number(oldGame.match.match_id) || oldGame.match.match_id === currentMatchId) {
    throw new CustomError(t('lastgame.none', { lng: locale }))
  }

  const newMatchPlayers = currentPlayers
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

  const msg = generateMessage(locale, playersFromLastGame)
  return `${msg}. ${t('lastgame.link', {
    lng: locale,
    url: `dotabuff.com/matches/${oldGame.match.match_id}`,
  })}`
}
