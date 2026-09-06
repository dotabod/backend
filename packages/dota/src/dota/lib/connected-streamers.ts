import type { SocketClient } from '../../types'
import type { GSIHandlerType } from '../gsi-handler-types'
import { gsiHandlers, twitchIdToToken, twitchNameToToken } from './consts'

export const getTokenFromTwitchId = function getTokenFromTwitchId(twitchId?: string | null) {
  if (!twitchId) {
    return null
  }
  if (!twitchIdToToken.has(twitchId)) {
    return null
  }

  const token = twitchIdToToken.get(twitchId)
  if (!token || !gsiHandlers.has(token)) {
    return null
  }

  return token
}

const getTokenFromTwitchName = function getTokenFromTwitchName(name?: string | null) {
  if (!name) {
    return null
  }
  if (!twitchNameToToken.has(name)) {
    return null
  }

  const token = twitchNameToToken.get(name)
  if (!token || !gsiHandlers.has(token)) {
    return null
  }

  return token
}

export const findUserByName = function findUserByName(name?: string): SocketClient | null {
  const token = getTokenFromTwitchName(name)
  if (!token) {
    return null
  }

  return gsiHandlers.get(token)?.client ?? null
}

export default function findUser(token?: string): SocketClient | null {
  if (!token || !gsiHandlers.has(token)) {
    return null
  }
  return gsiHandlers.get(token)?.client ?? null
}

export const findUserByTwitchId = function findUserByTwitchId(
  twitchId?: string
): SocketClient | null {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) {
    return null
  }

  return gsiHandlers.get(token)?.client ?? null
}

export const findGSIHandlerByTwitchId = function findGSIHandlerByTwitchId(
  twitchId?: string
): GSIHandlerType | null {
  const token = getTokenFromTwitchId(twitchId)
  if (!token) {
    return null
  }

  return gsiHandlers.get(token) ?? null
}
