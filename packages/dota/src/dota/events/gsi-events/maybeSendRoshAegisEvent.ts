import { redisClient } from '../../../db/redisInstance'
import type { SocketClient } from '../../../types'
import type { AegisRes } from './AegisRes'
import { emitAegisEvent } from './emitAegisEvent'
import { emitRoshEvent, type RoshRes } from './RoshRes'

export async function maybeSendRoshAegisEvent(token: string, client?: SocketClient) {
  if (!client) return

  const [aegisRes, roshRes] = await Promise.all([
    redisClient.getJson<AegisRes>(`${token}:aegis`),
    redisClient.getJson<RoshRes>(`${token}:roshan`),
  ])

  if (aegisRes) {
    emitAegisEvent(aegisRes, token, client)
  }

  if (roshRes) {
    emitRoshEvent(roshRes, token, client)
  }
}
