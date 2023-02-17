import RedisClient from '../../../db/redis.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

const redisClient = RedisClient.getInstance()

eventHandler.registerEvent(`hero:alive`, {
  handler: (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    async function handler() {
      const redisJson = (await redisClient.client.json.get(`${dotaClient.getToken()}:aegis`)) as any

      // Case one, we had aegis, and we die with it. Triggers on an aegis death
      if (!alive && redisJson?.playerId === dotaClient.playingHeroSlot) {
        void redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
        server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})

        return
      }
    }

    void handler()
  },
})
