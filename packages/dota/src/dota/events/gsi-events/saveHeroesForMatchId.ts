import { redisClient } from '../../../db/redisInstance'
import eventHandler from '../EventHandler'

// "Fresh roster (with heroes) was just fetched into Mongo via GetRealTimeStats → re-emit notable
// players." Emitted by the steam service only when a fetched game has all 10 heroes (the `teams[]`
// shape). Currently dormant: GetRealTimeStats is gated off (ENABLE_SPECTATE_FRIEND_GAME = false), so
// the notable-players overlay it drives is effectively only reached via the spectator path now.
eventHandler.registerEvent('saveHeroesForMatchId', {
  handler: async (dotaClient, { matchId }: { matchId: string }) => {
    const playingMatchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)
    if (playingMatchId && playingMatchId === matchId) {
      await dotaClient.emitNotablePlayers()
    }
  },
})
