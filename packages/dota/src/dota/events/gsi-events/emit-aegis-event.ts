import { getValueOrDefault } from '../../../settings'
import type { SocketClient } from '../../../types'
import { settingsKeys as DBSettings } from '../../../types/settings'
import { server } from '../../server'
import type { AegisRes } from './aegis-res'
import { getNewAegisTime } from './get-new-aegis-time'

export const emitAegisEvent = function emitAegisEvent(
  res: AegisRes,
  token: string,
  client: SocketClient
) {
  if (!res?.expireDate) {
    return
  }

  res = getNewAegisTime(res)
  if (res.expireS <= 0) {
    return
  }

  const tellChatAegis = getValueOrDefault(DBSettings.aegis, client.settings, client.subscription)
  if (!tellChatAegis) {
    return
  }

  const {
    eventPlayerId: _eventPlayerId,
    holderKillCountAtPickup: _holderKillCountAtPickup,
    ...socketPayload
  } = res
  server.io.to(token).emit('aegis-picked-up', socketPayload)
}
