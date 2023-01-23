import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'

export function getAccountsFromMatch(
  response?: delayedGames,
  players?: { heroid: number; accountid: number }[],
) {
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
