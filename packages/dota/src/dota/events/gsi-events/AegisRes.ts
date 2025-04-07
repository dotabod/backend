import { server } from '../../server.js'
import { getValueOrDefault, DBSettings } from '../../../settings.js'
import type { SocketClient } from '../../../types.js'
import { getNewAegisTime } from './getNewAegisTime.js'
import { redisClient } from '../../../db/redisInstance.js'
import { type RoshRes, emitRoshEvent } from './RoshRes.js'

export interface AegisRes {
  expireS: number
  playerId: number
  expireTime: string
  expireDate: Date
  snatched: boolean
  heroName: string
}

export function emitAegisEvent(res: AegisRes, token: string, client: SocketClient) {
  if (!res || !res.expireDate) return

  res = getNewAegisTime(res)
  if (res.expireS <= 0) return

  const tellChatAegis = getValueOrDefault(DBSettings.aegis, client.settings, client.subscription)
  if (!tellChatAegis) return

  server.io.to(token).emit('aegis-picked-up', res)
}

export async function maybeSendRoshAegisEvent(token: string, client?: SocketClient) {
  if (!client) return

  const aegisRes = (await redisClient.client.json.get(
    `${token}:aegis`,
  )) as unknown as AegisRes | null
  const roshRes = (await redisClient.client.json.get(
    `${token}:roshan`,
  )) as unknown as RoshRes | null

  if (aegisRes) {
    emitAegisEvent(aegisRes, token, client)
  }

  if (roshRes) {
    emitRoshEvent(roshRes, token, client)
  }
}
