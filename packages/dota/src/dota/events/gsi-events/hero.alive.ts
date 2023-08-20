import RedisClient from '../../../db/redis.js'
import { logger } from '../../../utils/logger.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

const redisClient = RedisClient.getInstance()

eventHandler.registerEvent(`hero:alive`, {
  handler: async (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    async function handler() {
      const redisJson = (await redisClient.client.json.get(`${dotaClient.getToken()}:aegis`)) as any

      // Case one, we had aegis, and we die with it. Triggers on an aegis death
      const playingHeroSlot = Number(
        await redisClient.client.get(`${dotaClient.getToken()}:playingHeroSlot`),
      )
      if (!alive && redisJson?.playerId === playingHeroSlot) {
        try {
          void redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
        } catch (e) {
          logger.error('Error in hero alive', { e })
        }
        server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})

        return
      }
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in hero alive', { e })
    }
  },
})
