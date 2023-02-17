import { t } from 'i18next'

import RedisClient from '../../../db/redis.js'
import { DBSettings, getValueOrDefault } from '../../../db/settings.js'
import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { fmtMSS } from '../../../utils/index.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { getHeroNameById } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import eventHandler from '../EventHandler.js'

const redisClient = RedisClient.getInstance()

export interface AegisRes {
  expireS: number
  playerId: number
  expireTime: string
  expireDate: Date
  snatched: boolean
  heroName: string
}

export function getNewAegisTime(res: AegisRes) {
  // calculate seconds delta between now and expireDate
  const newSeconds = Math.floor((new Date(res.expireDate).getTime() - Date.now()) / 1000)
  res.expireS = newSeconds > 0 ? newSeconds : 0

  return res
}
export function generateAegisMessage(res: AegisRes, lng: string) {
  res = getNewAegisTime(res)

  if (res.expireS <= 0) {
    return t('aegis.expired', { emote: ':)', lng, heroName: res.heroName })
  }

  if (res.snatched) {
    return t('aegis.snatched', { emote: 'PepeLaugh', lng, heroName: res.heroName })
  }

  return t('aegis.pickup', { lng, heroName: res.heroName })
}

export function emitAegisEvent(res: AegisRes, token: string) {
  if (!res || !res.expireDate) return

  res = getNewAegisTime(res)
  if (res.expireS <= 0) return

  server.io.to(token).emit('aegis-picked-up', res)
}

eventHandler.registerEvent(`event:${DotaEventTypes.AegisPickedUp}`, {
  handler: (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // expire for aegis in 5 minutes
    const expireS = 5 * 60 - gameTimeDiff
    const expireTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + expireS

    // server time
    const expireDate = dotaClient.addSecondsToNow(expireS)

    const heroName = getHeroNameById(
      dotaClient.players?.matchPlayers[event.player_id].heroid ?? 0,
      event.player_id,
    )

    const res = {
      expireS,
      playerId: event.player_id,
      expireTime: fmtMSS(expireTime),
      expireDate,
      snatched: event.snatched,
      heroName,
    }

    void redisClient.client.json.set(`${dotaClient.getToken()}:aegis`, '$', res)

    const chattersEnabled = getValueOrDefault(DBSettings.chatter, dotaClient.client.settings)
    const {
      roshPickup: { enabled: chatterEnabled },
    } = getValueOrDefault(DBSettings.chatters, dotaClient.client.settings)

    if (chattersEnabled && chatterEnabled) {
      dotaClient.say(generateAegisMessage(res, dotaClient.client.locale))
    }

    emitAegisEvent(res, dotaClient.getToken())
  },
})
