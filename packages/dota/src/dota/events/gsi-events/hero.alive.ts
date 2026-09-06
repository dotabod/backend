import RedisClient from '../../../db/redis-client'
import { getRedisNumberValue } from '../../../utils/index'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { server } from '../../server'
import eventHandler from '../event-handler'
import type { AegisRes } from './aegis-res'

eventHandler.registerEvent('hero:alive', {
  handler: async (dotaClient, alive: boolean) => {
    if (!dotaClient.client.stream_online) {
      return
    }
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }

    const redisClient = RedisClient.getInstance()
    const redisJson = await redisClient.getJson<AegisRes>(`${dotaClient.getToken()}:aegis`)

    // Case one, we had aegis, and we die with it. Triggers on an aegis death
    const playingHeroSlot = await getRedisNumberValue(`${dotaClient.getToken()}:playingHeroSlot`)

    if (!(!alive && redisJson?.playerId === playingHeroSlot)) {
      return
    }

    await redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
    server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})

    return
  },
})
