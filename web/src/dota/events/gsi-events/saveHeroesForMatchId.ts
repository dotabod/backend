// Only call to update our local players variable with hero ids

import { GSIHandler } from '../../GSIHandler.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`saveHeroesForMatchId`, {
  handler: (
    dotaClient: GSIHandler,
    { matchId, players }: { matchId: string; players: ReturnType<typeof getAccountsFromMatch> },
  ) => {
    if (dotaClient.playingBetMatchId && dotaClient.playingBetMatchId === matchId) {
      dotaClient.players = players
    }
  },
})
