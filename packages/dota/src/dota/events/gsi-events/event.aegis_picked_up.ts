import { t } from 'i18next'

import RedisClient from '../../../db/RedisClient.js'
import { DotaEvent, DotaEventTypes } from '../../../types.js'
import { fmtMSS } from '../../../utils/index.js'
import { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { getAccountsFromMatch } from '../../lib/getAccountsFromMatch.js'
import { getHeroNameOrColor } from '../../lib/heroes.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

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
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // expire for aegis in 5 minutes
    const expireS = 5 * 60 - gameTimeDiff
    const expireTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + expireS

    // server time
    const expireDate = dotaClient.addSecondsToNow(expireS)

    const { matchPlayers } = await getAccountsFromMatch({ gsi: dotaClient.client.gsi })

    const playerIdIndex =
      matchPlayers.findIndex((p) => p.playerid === event.player_id) ?? event.player_id
    const heroName = getHeroNameOrColor(matchPlayers[playerIdIndex]?.heroid ?? 0, playerIdIndex)

    const res = {
      expireS,
      playerId: playerIdIndex,
      expireTime: fmtMSS(expireTime),
      expireDate,
      snatched: event.snatched,
      heroName,
    }

    const redisClient = RedisClient.getInstance()
    await redisClient.client.json.set(`${dotaClient.getToken()}:aegis`, '$', res)

    say(dotaClient.client, generateAegisMessage(res, dotaClient.client.locale), {
      chattersKey: 'roshPickup',
    })

    emitAegisEvent(res, dotaClient.getToken())
  },
})
