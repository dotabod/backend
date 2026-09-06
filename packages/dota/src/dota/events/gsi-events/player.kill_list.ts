import { logger } from '@dotabod/shared-utils'

import RedisClient from '../../../db/redis-client'
import type { Player } from '../../../types'
import { isPlayingMatch } from '../../lib/is-playing-match'
import { server } from '../../server'
import eventHandler from '../event-handler'
import type { AegisRes } from './aegis-res'

eventHandler.registerEvent('player:kill_list', {
  handler: async (dotaClient, kill_list: Player['kill_list']) => {
    if (!dotaClient.client.stream_online) {
      return
    }
    if (!isPlayingMatch(dotaClient.client.gsi)) {
      return
    }

    const redisClient = RedisClient.getInstance()
    const redisJson = await redisClient.getJson<AegisRes>(`${dotaClient.getToken()}:aegis`)
    if (typeof redisJson?.eventPlayerId !== 'number') {
      return
    }
    if (typeof redisJson.holderKillCountAtPickup !== 'number') {
      return
    }

    const victimKey = `victimid_${redisJson.eventPlayerId}`
    if ((kill_list[victimKey] ?? 0) <= redisJson.holderKillCountAtPickup) {
      return
    }

    try {
      await redisClient.client.json.del(`${dotaClient.getToken()}:aegis`)
      server.io.to(dotaClient.getToken()).emit('aegis-picked-up', {})
    } catch (error) {
      logger.error('err redisClient aegis del', { error })
    }
  },
})
