import { delayedGames } from '@dotabod/prisma/dist/mongo/index.js'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameById } from '../dota/lib/heroes.js'
import CustomError from '../utils/customError.js'
import MongoDBSingleton from './MongoDBSingleton.js'

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
  const mongo = new MongoDBSingleton()
  const db = await mongo.connect()

  try {
    const gameHistory = await db
      .collection<delayedGames>('delayedGames')
      .find(
        {
          'teams.players.accountid': Number(steam32Id),
        },
        { sort: { createdAt: -1 }, limit: 2 },
      )
      .toArray()

    if (!Number(currentMatchId)) {
      const msg = !currentMatchId
        ? t('notPlaying', { emote: 'PauseChamp', lng: locale })
        : t('gameNotFound', { lng: locale })
      return gameHistory[0]?.match?.match_id
        ? `${msg} · ${t('lastgame.link', {
            lng: locale,
            url: `dotabuff.com/matches/${gameHistory[0].match.match_id}`,
          })}`
        : msg
    }

    if (!gameHistory.length)
      throw new CustomError(t('noLastMatch', { emote: 'PauseChamp', lng: locale }))
    if (gameHistory.length !== 2)
      throw new CustomError(t('noLastMatch', { emote: 'PauseChamp', lng: locale }))

    const [gameOne, gameTwo] = gameHistory as unknown as delayedGames[]
    const oldGame = gameOne.match.match_id === currentMatchId ? gameTwo : gameOne

    if (!currentPlayers?.length) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    if (!Number(oldGame.match.match_id) || oldGame.match.match_id === currentMatchId) {
      throw new CustomError(t('lastgame.none', { lng: locale }))
    }

    const newMatchPlayers = currentPlayers
    const { matchPlayers: oldMatchPlayers } = await getAccountsFromMatch({
      searchMatchId: oldGame.match.match_id,
    })

    const playersFromLastGame = newMatchPlayers
      .map((currentGamePlayer, i) => {
        if (steam32Id === currentGamePlayer.accountid) {
          return null
        }

        const old = oldMatchPlayers.find(
          (player) => player.accountid === currentGamePlayer.accountid,
        )
        if (!old) return null

        return {
          old,
          current: currentGamePlayer,
          currentIdx: i,
        }
      })
      .flatMap((f) => f ?? [])

    const msg = generateMessage(locale, playersFromLastGame)
    const totalPlayers =
      playersFromLastGame.length > 1
        ? t('lastgame.total', {
            lng: locale,
            count: playersFromLastGame.length,
          })
        : ''
    return `${totalPlayers} ${msg}. ${t('lastgame.link', {
      lng: locale,
      url: `dotabuff.com/matches/${oldGame.match.match_id}`,
    })}`.trim()
  } finally {
    await mongo.close()
  }
}
