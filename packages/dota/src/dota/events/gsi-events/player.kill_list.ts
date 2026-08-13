import { logger } from '@dotabod/shared-utils'
import RedisClient from '../../../db/RedisClient'
import type { Player } from '../../../types'
import { isPlayingMatch } from '../../lib/isPlayingMatch'
import { server } from '../../server'
import eventHandler from '../EventHandler'
import type { AegisRes } from './AegisRes'

eventHandler.registerEvent('player:kill_list', {
  handler: async (dotaClient, kill_list: Player['kill_list']) => {
    if (!dotaClient.client.stream_online) return
    if (!isPlayingMatch(dotaClient.client.gsi)) return

    const redisClient = RedisClient.getInstance()
    const redisJson = await redisClient.getJson<AegisRes>(`${dotaClient.getToken()}:aegis`)
    if (typeof redisJson?.eventPlayerId !== 'number') return

    const victimKey = `victimid_${redisJson.eventPlayerId}`
    if ((kill_list[victimKey] ?? 0) <= 0) return

    try {
      await redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
    } catch (e) {
      logger.error('err redisClient aegis del', { e })
    }
  },
})
