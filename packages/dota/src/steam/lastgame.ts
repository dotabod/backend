import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { getHeroNameOrColor } from '../dota/lib/heroes'
import { lookupRosterByMatchId, type RosterPlayer } from '../dota/lib/matchData'
import type { DelayedGames, SocketClient } from '../types'
import CustomError from '../utils/customError'
import { dotabuffMatchUrl } from '../utils/index'
import MongoDBSingleton from './MongoDBSingleton'

const generateMessage = (
  locale: string,
  playersFromLastGame: {
    old: RosterPlayer
    current: RosterPlayer
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
        currentMatchHero: getHeroNameOrColor(player.current.heroId ?? 0, player.currentIdx),
        lastMatchHero: getHeroNameOrColor(player.old.heroId ?? 0, oldIdx),
      }),
    )
    .join(' · ')
}

interface LastgameParams {
  locale: string
  steam32Id: number
  client: SocketClient
  currentMatchId?: string
  currentPlayers?: RosterPlayer[]
}

// Supabase is the source of truth for a user's own finished matches (written from
// their GSI). delayedGames is fed by Valve's realtime spectator API, which returns
// nothing for 8500+/Immortal players, so its newest cached entry can be a stale
// older match. Prefer Supabase for the "last game" link.
async function getLatestFinishedMatchId(steam32Id: number): Promise<string | null> {
  const { data } = await supabase
    .from('matches')
    .select('matchId')
    .eq('steam32Id', steam32Id)
    .not('won', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data?.matchId != null ? String(data.matchId) : null
}

export default async function lastgame({
  locale,
  steam32Id,
  client,
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
      const lastMatchId =
        (await getLatestFinishedMatchId(steam32Id)) ?? gameHistory[0]?.match?.match_id ?? null
      const url = dotabuffMatchUrl(client, lastMatchId)
      return url ? `${msg} · ${t('lastgame.link', { lng: locale, url })}` : msg
    }
    if (!gameHistory.length || gameHistory.length !== 2) {
      // Check supabase
      const { data: lg } = await supabase
        .from('matches')
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
      return t('matchData8500Alt', { lng: locale, command: '!lgs' })
    }

    const [gameOne, gameTwo] = gameHistory
    const oldGame = gameOne.match.match_id === currentMatchId ? gameTwo : gameOne

    if (!currentPlayers?.length) {
      throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
    }

    if (!Number(oldGame.match.match_id) || oldGame.match.match_id === currentMatchId) {
      throw new CustomError(t('lastgame.none', { lng: locale }))
    }

    const newMatchPlayers = currentPlayers
    const { matchPlayers: oldMatchPlayers } = await lookupRosterByMatchId(oldGame.match.match_id)

    const playersFromLastGame = newMatchPlayers
      .map((currentGamePlayer, i) => {
        if (steam32Id === currentGamePlayer.accountId) {
          return null
        }

        const old = oldMatchPlayers.find(
          (player) => player.accountId === currentGamePlayer.accountId,
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
    const url = dotabuffMatchUrl(client, oldGame.match.match_id)
    const linkSegment = url ? ` ${t('lastgame.link', { lng: locale, url })}` : ''
    return `${totalPlayers} ${msg}.${linkSegment}`.trim()
  } finally {
    await mongo.close()
  }
}
