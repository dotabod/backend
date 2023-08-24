import { delayedGames } from '@dotabod/prisma/dist/mongo/index.js'

import { mongoClient } from '../../steam'
import { Packet } from '../../types'
import { getCurrentMatchPlayers } from './getCurrentMatchPlayers'

export async function getAccountsFromMatch(gsi?: Packet) {
  const response = (await mongoClient
    .collection('delayedGames')
    .findOne({ 'match.match_id': gsi?.map?.matchid })) as unknown as delayedGames | undefined

  const players = getCurrentMatchPlayers(gsi)

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
