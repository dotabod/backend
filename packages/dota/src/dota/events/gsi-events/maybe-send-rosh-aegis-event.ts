import { redisClient } from '../../../db/redis-instance'
import type { SocketClient } from '../../../types'
import type { AegisRes } from './aegis-res'
import { emitAegisEvent } from './emit-aegis-event'
import { emitRoshEvent } from './rosh-res'
import type { RoshRes } from './rosh-res'

export const maybeSendRoshAegisEvent = async function maybeSendRoshAegisEvent(
  token: string,
  client?: SocketClient
) {
  if (!client) {
    return
  }

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
