// Only call to update our local players variable with hero ids

import { GSIHandler } from '../../GSIHandler.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`saveHeroesForMatchId`, {
  handler: async (dotaClient: GSIHandler, { matchId }: { matchId: string }) => {
    if (dotaClient.playingBetMatchId && dotaClient.playingBetMatchId === matchId) {
      await dotaClient.emitNotablePlayers()
    }
  },
})
