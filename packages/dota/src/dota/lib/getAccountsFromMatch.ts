import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import { DelayedGames, Packet } from '../../types'
import { getSpectatorPlayers } from './getSpectatorPlayers.js'

export async function getAccountsFromMatch({
  gsi,
  searchMatchId,
  searchPlayers,
}: {
  gsi?: Packet
  searchMatchId?: string
  searchPlayers?: {
    playerid: number
    heroid: number
    accountid: number
  }[]
} = {}) {
  const players = searchPlayers?.length ? searchPlayers : getSpectatorPlayers(gsi)

  // spectator account ids
  if (Array.isArray(players) && players.length) {
    return {
      matchPlayers: players,
      accountIds: players.map((player) => player.accountid),
    }
  }

  const matchId = searchMatchId || gsi?.map?.matchid

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
              heroid: a.heroid,
              accountid: Number(a.accountid),
              playerid: a.playerid,
            })),
            ...response.teams[1].players.map((a) => ({
              heroid: a.heroid,
              accountid: Number(a.accountid),
              playerid: a.playerid,
            })),
          ]
        : ([] as { heroid: number; accountid: number; playerid: number }[])

    return {
      matchPlayers,
      accountIds: matchPlayers.map((player) => player.accountid),
    }
  } finally {
    await mongo.close()
  }
}
