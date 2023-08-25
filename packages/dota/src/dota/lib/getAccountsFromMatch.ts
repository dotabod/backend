import { delayedGames } from '@dotabod/prisma/dist/mongo/index.js'

import { mongoClient } from '../../steam/index.js'
import { Packet } from '../../types.js'
import { getCurrentMatchPlayers } from './getCurrentMatchPlayers.js'

export async function getAccountsFromMatch(
  gsi?: Packet,
  searchMatchId?: string,
  searchPlayers?: {
    heroid: number
    accountid: number
  }[],
) {
  const response = (await mongoClient
    .collection('delayedGames')
    .findOne({ 'match.match_id': searchMatchId || gsi?.map?.matchid })) as unknown as
    | delayedGames
    | undefined

  const players = searchPlayers?.length ? searchPlayers : getCurrentMatchPlayers(gsi)

  const matchPlayers =
    Array.isArray(players) && players.length
      ? players
      : response
      ? [
          ...response.teams[0].players.map((a) => ({
            heroid: a.heroid,
            accountid: Number(a.accountid),
          })),
          ...response.teams[1].players.map((a) => ({
            heroid: a.heroid,
            accountid: Number(a.accountid),
          })),
        ]
      : []

  return {
    matchPlayers,
    accountIds: matchPlayers.map((player) => player.accountid),
  }
}
