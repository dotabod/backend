import MongoDBSingleton from '../mongo-db-singleton'
import type { DelayedGames, Packet } from '../types/index'
import { getSpectatorPlayers } from './get-spectator-players'

export const getAccountsFromMatch = async function getAccountsFromMatch({
  gsi,
  searchMatchId,
  searchPlayers,
}: {
  gsi?: Packet
  searchMatchId?: string
  searchPlayers?: {
    heroid: number
    accountid: number
  }[]
} = {}) {
  const players =
    searchPlayers !== undefined && searchPlayers.length > 0
      ? searchPlayers
      : getSpectatorPlayers(gsi)

  // spectator account ids
  if (Array.isArray(players) && players.length) {
    return {
      accountIds: players.map((player) => player.accountid),
      matchPlayers: players,
    }
  }

  const matchId = searchMatchId ?? gsi?.map?.matchid

  const mongo = MongoDBSingleton
  const db = await mongo.connect()

  try {
    const response = await db
      .collection<DelayedGames>('delayedGames')
      .findOne({ 'match.match_id': matchId })

    const matchPlayers =
      Array.isArray(response?.teams) && response?.teams.length === 2
        ? [
            ...response.teams[0].players.map((a) => ({
              accountid: Number(a.accountid),
              heroid: a.heroid,
            })),
            ...response.teams[1].players.map((a) => ({
              accountid: Number(a.accountid),
              heroid: a.heroid,
            })),
          ]
        : ([] as { heroid: number; accountid: number }[])

    return {
      accountIds: matchPlayers.map((player) => player.accountid),
      matchPlayers,
    }
  } finally {
    await mongo.close()
  }
}
