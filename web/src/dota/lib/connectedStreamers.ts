import { SocketClient } from '../../types.js'
import { gsiHandlers, twitchIdToToken } from '../index.js'

export default function findUser(token?: string): SocketClient | null {
  if (!token || !gsiHandlers.has(token)) return null
  return gsiHandlers.get(token)?.client ?? null
}

export function findUserByTwitchId(twitchId?: string): SocketClient | null {
  if (!twitchId) return null
  if (!twitchIdToToken.has(twitchId)) return null

  const token = twitchIdToToken.get(twitchId)
  if (!token || !gsiHandlers.has(token)) return null

  return gsiHandlers.get(token)?.client ?? null
}
