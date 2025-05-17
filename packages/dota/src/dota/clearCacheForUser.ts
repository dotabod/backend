import { getAuthProvider } from '@dotabod/shared-utils'
import type { SocketClient } from '../types.js'
import { deleteRedisData } from './GSIHandler.js'
import { gsiHandlers, invalidTokens, twitchIdToToken, twitchNameToToken } from './lib/consts.js'

// three types of in-memory cache exists
export async function clearCacheForUser(client?: SocketClient) {
  if (!client) return

  // Reset multiAccount explicitly
  client.multiAccount = undefined

  // mark the client as disabled while we cleanup everything
  // just so new items won't get added while we do this
  gsiHandlers.get(client.token)?.disable()

  const accountId = client.Account?.providerAccountId ?? ''
  twitchIdToToken.delete(accountId)
  twitchNameToToken.delete(client.name)

  const authProvider = getAuthProvider()
  authProvider.removeUser(accountId)

  await deleteRedisData(client)

  gsiHandlers.delete(client.token)

  // Also remove from invalidTokens set to allow re-authentication
  invalidTokens.delete(client.token)
  if (accountId) invalidTokens.delete(accountId)

  return true
}
