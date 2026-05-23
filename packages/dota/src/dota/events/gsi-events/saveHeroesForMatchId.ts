import { redisClient } from '../../../db/redisInstance'
import eventHandler from '../EventHandler'

// "Fresh roster (with heroes) was just fetched into Mongo via GetRealTimeStats → re-emit notable
// players." Emitted by the steam service only when a fetched game has all 10 heroes (the `teams[]`
// shape). Currently dormant — GetRealTimeStats is gated off via ENABLE_SPECTATE_FRIEND_GAME, so this
// handler doesn't fire; notable-players overlay only updates while spectating today. PRESERVED, not
// dead — comes back when spectate-friend is revived. See memory `keep-spectate-friend-path`.
eventHandler.registerEvent('saveHeroesForMatchId', {
  handler: async (dotaClient, { matchId }: { matchId: string }) => {
    const playingMatchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)
    if (playingMatchId && playingMatchId === matchId) {
      await dotaClient.emitNotablePlayers()
    }
  },
})
