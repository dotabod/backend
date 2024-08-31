import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { DelayedGames, Packet, Players } from '../../types'
import { getSpectatorPlayers } from './getSpectatorPlayers.js'

export async function getAccountsFromMatch({
  gsi,
  searchMatchId,
  searchPlayers,
}: {
  gsi?: Packet
  searchMatchId?: string
  searchPlayers?: Players
} = {}): Promise<{
  matchPlayers: Players
  accountIds: number[]
}> {
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

    const hasTwoTeams = Array.isArray(response?.teams) && response?.teams.length === 2

    if (response?.players?.length && !hasTwoTeams) {
      return {
        matchPlayers: response.players.map((a) => ({
          heroid: a.heroid,
          accountid: Number(a.accountid),
          playerid: null, // Unknown until we have two teams
        })),
        accountIds: response.players.map((a) => Number(a.accountid)),
      }
    }

    if (hasTwoTeams) {
      const matchPlayers = [
        ...response.teams[0].players.map((a) => ({
          heroid:
            a.heroid ||
            response?.players?.find((p) => Number(p.accountid) === Number(a.accountid))?.heroid,
          accountid: Number(a.accountid),
          playerid: a.playerid,
        })),
        ...response.teams[1].players.map((a) => ({
          heroid:
            a.heroid ||
            response?.players?.find((p) => Number(p.accountid) === Number(a.accountid))?.heroid,
          accountid: Number(a.accountid),
          playerid: a.playerid,
        })),
      ]
      return {
        matchPlayers,
        accountIds: matchPlayers.map((player) => player.accountid),
      }
    }
  } finally {
    await mongo.close()
  }

  return {
    matchPlayers: [
      {
        heroid: gsi?.hero?.id,
        accountid: Number(gsi?.player?.accountid),
        playerid: null,
      },
    ],
    accountIds: [Number(gsi?.player?.accountid)],
  }
}
