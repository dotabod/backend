import { SocketClient } from '../../types.js'
import { GSIHandler } from '../GSIHandler.js'
import { gsiHandlers, twitchIdToToken } from './consts.js'

export function getTokenFromTwitchId(twitchId?: string | null) {
  if (!twitchId) return null
  if (!twitchIdToToken.has(twitchId)) return null

  const token = twitchIdToToken.get(twitchId)
  if (!token || !gsiHandlers.has(token)) return null

  return token
}

export default function findUser(token?: string): SocketClient | null {
  if (!token || !gsiHandlers.has(token)) return null
  return gsiHandlers.get(token)?.client ?? null
}

export function findUserByTwitchId(twitchId?: string): SocketClient | null {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) return null

  return gsiHandlers.get(token)?.client ?? null
}

export function findGSIHandlerByTwitchId(twitchId?: string): GSIHandler | null {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) return null

  return gsiHandlers.get(token) ?? null
}
