import { t } from 'i18next'
import { DBSettings, getValueOrDefault } from '../../../settings.js'
import type { SocketClient } from '../../../types.js'
import { server } from '../../server.js'
import { getRoshCountMessage } from './getRoshCountMessage.js'

export interface RoshRes {
  minS: number
  maxS: number
  minTime: string
  maxTime: string
  minDate: Date
  maxDate: Date
  count: number
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

  const msgs: string[] = []
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
