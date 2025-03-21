import { t } from 'i18next'

import RedisClient from '../../../db/RedisClient.js'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import { type DotaEvent, DotaEventTypes, type SocketClient } from '../../../types.js'
import { fmtMSS, getRedisNumberValue } from '../../../utils/index.js'
import type { GSIHandler } from '../../GSIHandler.js'
import { server } from '../../index.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { say } from '../../say.js'
import eventHandler from '../EventHandler.js'

export interface RoshRes {
  minS: number
  maxS: number
  minTime: string
  maxTime: string
  minDate: Date
  maxDate: Date
  count: number
}

// Doing it this way so i18n can pick up the t('') strings
export function getRoshCountMessage(props: { lng: string; count: number }) {
  let roshCountMsg: string
  switch (props.count) {
    case 1:
      roshCountMsg = t('roshanCount.1', props)
      break
    case 2:
      roshCountMsg = t('roshanCount.2', props)
      break
    case 3:
      roshCountMsg = t('roshanCount.3', props)
      break
    default:
      roshCountMsg = t('roshanCount.more', { lng: props.lng, count: props.count })
      break
  }
  return roshCountMsg
}

export function getNewRoshTime(res: RoshRes) {
  // Recalculate using server time for seconds left
  const min = Math.floor((new Date(res.minDate).getTime() - Date.now()) / 1000)
  const max = Math.floor((new Date(res.maxDate).getTime() - Date.now()) / 1000)
  res.minS = min > 0 ? min : 0
  res.maxS = max > 0 ? max - res.minS : 0

  return res
}

export function generateRoshanMessage(res: RoshRes, lng: string) {
  res = getNewRoshTime(res)

  const msgs = []
  if (res.maxS > 0) {
    msgs.push(
      t('roshanKilled', {
        min: res.minTime,
        max: res.maxTime,
        lng,
      }),
    )
  }

  msgs.push(getRoshCountMessage({ lng, count: res.count }))

  return msgs.join(' · ')
}

export function emitRoshEvent(res: RoshRes, token: string, client: SocketClient) {
  if (!res || !res.minDate) return
  res = getNewRoshTime(res)

  // Only check settings if client is provided
  if (!client) return

  const tellChatRosh = getValueOrDefault(DBSettings.rosh, client.settings, client.subscription)
  if (!tellChatRosh) return

  server.io.to(token).emit('roshan-killed', res)
}

eventHandler.registerEvent(`event:${DotaEventTypes.RoshanKilled}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    const redisClient = RedisClient.getInstance()
    const matchId = await redisClient.client.get(`${dotaClient.getToken()}:matchId`)

    const playingGameMode = await getRedisNumberValue(
      `${matchId}:${dotaClient.getToken()}:gameMode`,
    )

    // doing map gametime - event gametime in case the user reconnects to a match,
    // and the gametime is over the event gametime
    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // min spawn for rosh in 5 + 3 minutes
    let minS = 5 * 60 + 3 * 60 - gameTimeDiff
    // max spawn for rosh in 5 + 3 + 3 minutes
    let maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff

    // Check if the game mode is Turbo (23)
    if (playingGameMode === 23) {
      minS /= 2
      maxS /= 2
    }

    const minTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + minS
    const maxTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + maxS

    // server time
    const minDate = dotaClient.addSecondsToNow(minS)
    const maxDate = dotaClient.addSecondsToNow(maxS)

    // TODO: move this to a redis handler
    const redisJson = (await redisClient.client.json.get(
      `${dotaClient.getToken()}:roshan`,
    )) as RoshRes | null
    const count = redisJson ? Number(redisJson.count) : 0
    const res = {
      minS,
      maxS,
      minTime: fmtMSS(minTime),
      maxTime: fmtMSS(maxTime),
      minDate,
      maxDate,
      count: count + 1,
    }

    await redisClient.client.json.set(`${dotaClient.getToken()}:roshan`, '$', res)

    say(dotaClient.client, generateRoshanMessage(res, dotaClient.client.locale), {
      chattersKey: 'roshanKilled',
    })

    emitRoshEvent(res, dotaClient.getToken(), dotaClient.client)
  },
})
