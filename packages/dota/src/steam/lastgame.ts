import { t } from 'i18next'

import { getAccountsFromMatch } from '../dota/lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../dota/lib/heroes.js'
import type { Players } from '../types.js'
import type { DelayedGames } from '../types.js'
import CustomError from '../utils/customError.js'
import MongoDBSingleton from './MongoDBSingleton.js'
import supabase from '../db/supabase.js'

const generateMessage = (
  locale: string,
  playersFromLastGame: {
    old: Partial<{
      heroid: number
      accountid: number
    }>
    current: Partial<{
      heroid: number
      accountid: number
    }>
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
        currentMatchHero: getHeroNameOrColor(player.current.heroid, player.currentIdx),
        lastMatchHero: getHeroNameOrColor(player.old.heroid, oldIdx),
      }),
    )
    .join(' · ')
}

interface LastgameParams {
  locale: string
  steam32Id: number
  currentMatchId?: string
  currentPlayers?: Players
}

export default async function lastgame({
  locale,
  steam32Id,
  currentMatchId,
  currentPlayers,
}: LastgameParams) {
  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const gameHistory = await db
      .collection<DelayedGames>('delayedGames')
      .find(
        {
          $or: [
            { 'players.accountid': Number(steam32Id) },
            { 'teams.players.accountid': Number(steam32Id) },
          ],
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
    if (!gameHistory.length || gameHistory.length !== 2) {
      // Check supabase
      const { data: lg } = await supabase
        .from('bets')
        .select('matchId')
        .eq('steam32Id', steam32Id)
        .not('won', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!lg) {
        throw new CustomError(t('noLastMatch', { emote: 'PauseChamp', lng: locale }))
      }

      // The delayed API didn't save their match, but we have it in supabase
      // Must mean they're a 8500+ player
      const oldGame = lg.matchId

      return `${t('lastgame.link', {
        lng: locale,
        url: `dotabuff.com/matches/${oldGame}`,
      })} · ${t('matchData8500', { emote: 'PoroSad', lng: locale })}`
    }

    const [gameOne, gameTwo] = gameHistory as unknown as DelayedGames[]
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
