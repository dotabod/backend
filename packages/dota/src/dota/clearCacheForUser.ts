import { getAuthProvider } from '../twitch/lib/getAuthProvider.js'
import { SocketClient } from '../types.js'
import { redisClient } from './GSIHandler.js'
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

  const clientKeys = [
    `${client.steam32Id ?? ''}:medal`,
    `${client.token}:roshan`,
    `${client.token}:aegis`,
    `${client.token}:treadtoggle`,
  ]

  try {
    await Promise.all(clientKeys.map((key) => redisClient.client.json.del(key)))
  } catch (e) {
    // ignore any redis issues with deletions
  }

  gsiHandlers.delete(client.token)
  return true
}
