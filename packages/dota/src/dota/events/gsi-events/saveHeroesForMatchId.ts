import { GSIHandler, redisClient } from '../../GSIHandler.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent(`saveHeroesForMatchId`, {
  handler: async (dotaClient: GSIHandler, { matchId }: { matchId: string }) => {
    const playingMatchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)
    if (playingMatchId && playingMatchId === matchId) {
      await dotaClient.emitNotablePlayers()
    }
  },
})
