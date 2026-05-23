import { getValueOrDefault } from '../../../settings'
import type { SocketClient } from '../../../types'
import { settingsKeys as DBSettings } from '../../../types/settings'
import { server } from '../../server'
import type { AegisRes } from './AegisRes'
import { getNewAegisTime } from './getNewAegisTime'

export function emitAegisEvent(res: AegisRes, token: string, client: SocketClient) {
  if (!res?.expireDate) return

  res = getNewAegisTime(res)
  if (res.expireS <= 0) return

  const tellChatAegis = getValueOrDefault(DBSettings.aegis, client.settings, client.subscription)
  if (!tellChatAegis) return

  server.io.to(token).emit('aegis-picked-up', res)
}
