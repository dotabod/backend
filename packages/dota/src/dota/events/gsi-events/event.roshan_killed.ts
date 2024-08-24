import { t } from 'i18next'

import RedisClient from '../../../db/RedisClient.js'
import { type DotaEvent, DotaEventTypes } from '../../../types.js'
import { fmtMSS } from '../../../utils/index.js'
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
  radiantPercentage: number
  direPercentage: number
}

// Doing it this way so i18n can pick up the t('') strings
export function getRoshCountMessage(props: { lng: string; count: number }) {
  let roshCountMsg
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

export function calculateRadiantDirePercentages(minS: number, maxS: number) {
  const totalDuration = maxS - minS
  const radiantDuration = 300 - minS
  const direDuration = maxS - 300

  const radiantPercentage = (radiantDuration / totalDuration) * 100
  const direPercentage = (direDuration / totalDuration) * 100

  return {
    radiantPercentage: radiantPercentage > 0 ? radiantPercentage : 0,
    direPercentage: direPercentage > 0 ? direPercentage : 0,
  }
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

  const percentages = calculateRadiantDirePercentages(res.minS, res.maxS)
  res.radiantPercentage = percentages.radiantPercentage
  res.direPercentage = percentages.direPercentage

  msgs.push(
    t('roshanPercentages', {
      radiant: res.radiantPercentage.toFixed(0),
      dire: res.direPercentage.toFixed(0),
      lng,
    }),
  )

  msgs.push(getRoshCountMessage({ lng, count: res.count }))

  return msgs.join(' · ')
}

export function emitRoshEvent(res: RoshRes, token: string) {
  if (!res || !res.minDate) return
  res = getNewRoshTime(res)

  server.io.to(token).emit('roshan-killed', res)
}

eventHandler.registerEvent(`event:${DotaEventTypes.RoshanKilled}`, {
  handler: async (dotaClient: GSIHandler, event: DotaEvent) => {
    if (!isPlayingMatch(dotaClient.client.gsi)) return
    if (!dotaClient.client.stream_online) return

    // doing map gametime - event gametime in case the user reconnects to a match,
    // and the gametime is over the event gametime
    const gameTimeDiff =
      (dotaClient.client.gsi?.map?.game_time ?? event.game_time) - event.game_time

    // TODO: Turbo is 3 minutes min 8 minutes max

    // min spawn for rosh in 5 + 3 minutes
    const minS = 5 * 60 + 3 * 60 - gameTimeDiff
    const minTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + minS

    // max spawn for rosh in 5 + 3 + 3 minutes
    const maxS = 5 * 60 + 3 * 60 + 3 * 60 - gameTimeDiff
    const maxTime = (dotaClient.client.gsi?.map?.clock_time ?? 0) + maxS

    // server time
    const minDate = dotaClient.addSecondsToNow(minS)
    const maxDate = dotaClient.addSecondsToNow(maxS)

    const redisClient = RedisClient.getInstance()
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
      radiantPercentage: 0,
      direPercentage: 0,
    }

    await redisClient.client.json.set(`${dotaClient.getToken()}:roshan`, '$', res)

    say(dotaClient.client, generateRoshanMessage(res, dotaClient.client.locale), {
      chattersKey: 'roshanKilled',
    })

    emitRoshEvent(res, dotaClient.getToken())
  },
})
