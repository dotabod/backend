import type { SocketClient } from '../../types'
import type { GSIHandlerType } from '../gsi-handler-types'
import { gsiHandlers, twitchIdToToken, twitchNameToToken } from './consts'

const isMissingLookupKey = function isMissingLookupKey(
  value: string | null | undefined
): value is null | undefined {
  return value === null || value === undefined || value.length === 0
}

export const getTokenFromTwitchId = function getTokenFromTwitchId(twitchId?: string | null) {
  if (isMissingLookupKey(twitchId)) {
    return null
  }
  if (!twitchIdToToken.has(twitchId)) {
    return null
  }

  const token = twitchIdToToken.get(twitchId)
  if (isMissingLookupKey(token) || !gsiHandlers.has(token)) {
    return null
  }

  return token
}

const getTokenFromTwitchName = function getTokenFromTwitchName(name?: string | null) {
  if (isMissingLookupKey(name)) {
    return null
  }
  if (!twitchNameToToken.has(name)) {
    return null
  }

  const token = twitchNameToToken.get(name)
  if (isMissingLookupKey(token) || !gsiHandlers.has(token)) {
    return null
  }

  return token
}

export const findUserByName = function findUserByName(name?: string): SocketClient | null {
  const token = getTokenFromTwitchName(name)
  if (isMissingLookupKey(token)) {
    return null
  }

  return gsiHandlers.get(token)?.client ?? null
}

export default function findUser(token?: string): SocketClient | null {
  if (isMissingLookupKey(token) || !gsiHandlers.has(token)) {
    return null
  }
  return gsiHandlers.get(token)?.client ?? null
}

export const findUserByTwitchId = function findUserByTwitchId(
  twitchId?: string
): SocketClient | null {
  const token = getTokenFromTwitchId(twitchId)
  if (isMissingLookupKey(token)) {
    return null
  }

  return gsiHandlers.get(token)?.client ?? null
}

export const findGSIHandlerByTwitchId = function findGSIHandlerByTwitchId(
  twitchId?: string
): GSIHandlerType | null {
  const token = getTokenFromTwitchId(twitchId)
  if (isMissingLookupKey(token)) {
    return null
  }

  return gsiHandlers.get(token) ?? null
}
