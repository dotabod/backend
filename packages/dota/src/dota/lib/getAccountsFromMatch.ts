import { delayedGames } from '@dotabod/prisma/dist/mongo/index.js'

import { mongoClient } from '../../steam/index.js'
import { Packet } from '../../types.js'
import { getCurrentMatchPlayers } from './getCurrentMatchPlayers.js'

export async function getAccountsFromMatch({
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
  const players = searchPlayers?.length ? searchPlayers : getCurrentMatchPlayers(gsi)

  if (Array.isArray(players) && players.length) {
    return {
      matchPlayers: players,
      accountIds: players.map((player) => player.accountid),
    }
  }

  const matchId = searchMatchId || gsi?.map?.matchid
  const response = await mongoClient
    .collection<delayedGames>('delayedGames')
    .findOne({ 'match.match_id': matchId })

  let matchPlayers = [] as { heroid: number; accountid: number }[]
  if (Array.isArray(response?.teams) && response?.teams.length === 2) {
    matchPlayers = [
      ...response.teams[0].players.map((a) => ({
        heroid: a.heroid,
        accountid: Number(a.accountid),
      })),
      ...response.teams[1].players.map((a) => ({
        heroid: a.heroid,
        accountid: Number(a.accountid),
      })),
    ]
  }

  return {
    matchPlayers,
    accountIds: matchPlayers.map((player) => player.accountid),
  }
}
