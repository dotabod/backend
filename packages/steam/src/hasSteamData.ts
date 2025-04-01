import type { DelayedGames } from './types/index.js'

const isDev = process.env.DOTABOD_ENV === 'development'

export function hasSteamData(game?: DelayedGames | null) {
  const hasTeams = Array.isArray(game?.teams) && game?.teams.length === 2
  const hasPlayers =
    hasTeams &&
    Array.isArray(game?.teams[0]?.players) &&
    Array.isArray(game?.teams[1]?.players) &&
    game?.teams[0]?.players?.length === 5 &&
    game?.teams[1]?.players?.length === 5

  // Dev should be able to test in a lobby with bot matches
  const hasAccountIds = isDev
    ? hasPlayers // dev local lobby just needs the players array
    : hasPlayers &&
      game?.teams[0]?.players?.every((player) => player.accountid) &&
      game?.teams[1]?.players?.every((player) => player.accountid)
  const hasHeroes =
    hasPlayers &&
    game?.teams[0]?.players?.every((player) => player.heroid) &&
    game?.teams[1]?.players?.every((player) => player.heroid)
  return { hasAccountIds, hasPlayers, hasHeroes }
}
