import RedisClient from '../../../db/RedisClient.js'
import { getRedisNumberValue } from '../../../utils/index.js'
import type { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../server.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

eventHandler.registerEvent('hero:alive', {
  handler: async (dotaClient: GSIHandler, alive: boolean) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const redisClient = RedisClient.getInstance()
    const redisJson = (await redisClient.client.json.get(`${dotaClient.getToken()}:aegis`)) as any

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
