import { getValueOrDefault } from '../../../settings.js'
import type { SocketClient } from '../../../types.js'
import { settingsKeys as DBSettings } from '../../../types/settings.js'
import { server } from '../../server.js'
import type { AegisRes } from './AegisRes.js'
import { getNewAegisTime } from './getNewAegisTime.js'

export function emitAegisEvent(res: AegisRes, token: string, client: SocketClient) {
  if (!res || !res.expireDate) return

  res = getNewAegisTime(res)
  if (res.expireS <= 0) return

  const tellChatAegis = getValueOrDefault(DBSettings.aegis, client.settings, client.subscription)
  if (!tellChatAegis) return

  server.io.to(token).emit('aegis-picked-up', res)
}
