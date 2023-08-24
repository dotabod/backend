import { getAuthProvider } from '../twitch/lib/getAuthProvider.js'
import { SocketClient } from '../types.js'
import { deleteRedisData } from './GSIHandler.js'
import { gsiHandlers, twitchIdToToken } from './lib/consts.js'

// three types of in-memory cache exists

export async function clearCacheForUser(client?: SocketClient | null) {
  if (!client) return false

  // mark the client as disabled while we cleanup everything
  // just so new items won't get added while we do this
  const handler = gsiHandlers.get(client.token)
  if (handler) {
    handler.disable()
  }

  const accountId = client.Account?.providerAccountId ?? ''
  twitchIdToToken.delete(accountId)

  const authProvider = getAuthProvider()
  authProvider.removeUser(accountId)

  await deleteRedisData(client)

  gsiHandlers.delete(client.token)
  return true
}
