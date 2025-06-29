import { redisClient } from '../../../db/redisInstance.js'
import type { SocketClient } from '../../../types.js'
import type { AegisRes } from './AegisRes.js'
import { emitAegisEvent } from './emitAegisEvent.js'
import { emitRoshEvent, type RoshRes } from './RoshRes.js'

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
