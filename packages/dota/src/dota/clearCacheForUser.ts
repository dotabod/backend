import { getAuthProvider } from '@dotabod/shared-utils'
import type { SocketClient } from '../types'
import { deleteRedisData } from './GSIHandler'
import { gsiHandlers, twitchIdToToken, twitchNameToToken } from './lib/consts'

// Tear down all in-memory caches for a user.
//
// Note: this does NOT touch `invalidTokens` — the caller decides whether the
// token should be invalidated (ban / requires_refresh on) or re-enabled
// (re-auth / DELETE for cleanup). Mixing both responsibilities here caused a
// real bug: the watcher's ban branch added a token to invalidTokens immediately
// before calling clearCacheForUser, which then deleted it — silently undoing
// the watcher's fast-path rejection. See packages/dota/src/db/watcher.ts.
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

  return true
}
