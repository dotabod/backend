import { t } from 'i18next'
import RedisClient from '../db/RedisClient'
import { MatchDataService } from '../dota/lib/matchData'
import { ENABLE_SPECTATE_FRIEND_GAME } from '../settings'
import type { DelayedGames, SocketClient } from '../types'
import CustomError from '../utils/customError'
import { is8500Plus } from '../utils/index'
import { steamSocket } from './ws'

interface RealtimeStatsOptions {
  client: SocketClient
  token: string
  locale: string
  forceRefetchAll?: boolean
  refetchCards?: boolean
}

type RealtimePlayer = DelayedGames['teams'][number]['players'][number]

export async function getRealtimeStats({
  client,
  token,
  locale,
  forceRefetchAll = false,
  refetchCards = false,
}: RealtimeStatsOptions): Promise<DelayedGames> {
  const matchId = client.gsi?.map?.matchid
  if (!matchId) {
    throw new CustomError(t('notPlaying', { emote: 'PauseChamp', lng: locale }))
  }

  const matchData = new MatchDataService(client)
  const roster = await matchData.resolveRoster()
  let steamServerId: string | null = null

  if (roster.source === 'sourcetv') {
    const doc = await matchData.getDelayedGameDoc()
    const sourceTvServerId = doc?.match?.server_steam_id
    if (sourceTvServerId && String(sourceTvServerId) !== '0') {
      steamServerId = String(sourceTvServerId)
    }
  } else {
    // PRESERVED — ordinary pubs still depend on the disabled spectate-friend lookup. SourceTV
    // matches do not: Valve publishes their server_steam_id in the public GC feed.
    if (!ENABLE_SPECTATE_FRIEND_GAME) {
      throw new CustomError(t('matchDataValveDisabled', { emote: 'PoroSad', lng: locale }))
    }
    if (is8500Plus(client)) {
      throw new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale }))
    }

    const redisClient = RedisClient.getInstance()
    steamServerId = await redisClient.client.get(`${matchId}:${token}:steamServerId`)
  }

  if (!steamServerId) {
    throw new CustomError(t('missingMatchData', { emote: 'PauseChamp', lng: locale }))
  }

  return new Promise<DelayedGames>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new CustomError(t('matchData8500', { emote: 'PoroSad', lng: locale })))
    }, 10_000)

    steamSocket.emit(
      'getRealTimeStats',
      {
        match_id: matchId,
        forceRefetchAll,
        refetchCards,
        steam_server_id: steamServerId,
        token,
      },
      (err: unknown, data: DelayedGames) => {
        clearTimeout(timeoutId)
        if (err) reject(err)
        else resolve(data)
      },
    )
  })
}

export function findRealtimePlayer(
  game: DelayedGames,
  accountId: number | undefined,
  playerIdx: number | undefined,
): RealtimePlayer | undefined {
  if (accountId && Number.isFinite(accountId)) {
    const accountPlayer = game.teams
      .flatMap((team) => team.players)
      .find((player) => Number(player.accountid) === accountId)
    if (accountPlayer) return accountPlayer
  }

  if (playerIdx === undefined) return undefined
  const teamIndex = playerIdx > 4 ? 1 : 0
  return game.teams[teamIndex]?.players[playerIdx % 5]
}
