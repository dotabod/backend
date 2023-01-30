import RedisClient from '../../../db/redis.js'
import { Player } from '../../../types.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

const redisClient = RedisClient.getInstance()

// TODO: check kill list value
eventHandler.registerEvent(`player:kill_list`, {
  handler: (dotaClient: GSIHandler, kill_list: Player['kill_list']) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    async function handler() {
      const redisJson = (await redisClient.client.json.get(`${dotaClient.getToken()}:aegis`)) as any
      if (typeof redisJson?.playerId !== 'number') return

      // Remove aegis icon from the player we just killed
      if (Object.values(kill_list).includes(redisJson.playerId)) {
        void redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
        server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
      }
    }

    void handler()
  },
})
