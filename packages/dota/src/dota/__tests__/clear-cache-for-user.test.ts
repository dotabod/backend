// Locks in the contract that clearCacheForUser does NOT touch invalidTokens.
// Callers are responsible for invalidTokens — see packages/dota/src/db/watcher.ts.
//
// Why this exists: the historical impl deleted from invalidTokens, which
// silently undid the watcher's "add to invalidTokens" calls (because the add
// ran BEFORE clearCacheForUser). Moving that responsibility to callers means
// the order of operations no longer matters, but a future refactor could
// re-introduce the bug — this test guards against that.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildSharedUtilsMock,
  createGsiHandlerStub,
  createSocketClientStub,
  createTwitchAccountStub,
} from '../../__tests__/shared-mocks'

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    getAuthProvider: () => ({ removeUser: () => {} }),
    logger: {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    },
    supabase: {
      from: () => ({}),
      rpc: async () => await Promise.resolve({ data: [], error: null }),
    },
  })
)

// deleteRedisData touches redisClient + steam socket; stub the whole GSIHandler
// re-export surface that clearCacheForUser depends on.
vi.doMock(import('../gsi-handler'), () => ({
  deleteRedisData: async () => {},
}))

const { clearCacheForUser } = await import('../clear-cache-for-user')
const { gsiHandlers, invalidTokens, twitchIdToToken, twitchNameToToken } =
  await import('../lib/consts')

beforeEach(() => {
  gsiHandlers.clear()
  invalidTokens.clear()
  twitchIdToToken.clear()
  twitchNameToToken.clear()
})

describe('clearCacheForUser', () => {
  it('removes the client from gsiHandlers and the lookup maps', async () => {
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'tw' }),
      name: 'name',
      token: 'tok',
    })
    gsiHandlers.set('tok', createGsiHandlerStub(client))
    twitchIdToToken.set('tw', 'tok')
    twitchNameToToken.set('name', 'tok')

    await clearCacheForUser(client)

    expect(gsiHandlers.has('tok')).toBeFalsy()
    expect(twitchIdToToken.has('tw')).toBeFalsy()
    expect(twitchNameToToken.has('name')).toBeFalsy()
  })

  it('does NOT remove entries from invalidTokens (caller controls that)', async () => {
    const client = createSocketClientStub({
      Account: createTwitchAccountStub({ providerAccountId: 'tw-keep' }),
      name: 'keep',
      token: 'tok-keep',
    })
    gsiHandlers.set('tok-keep', createGsiHandlerStub(client))
    invalidTokens.add('tok-keep')
    invalidTokens.add('tw-keep')

    await clearCacheForUser(client)

    // Both entries must survive. If clearCacheForUser deletes them, the
    // watcher's ban / requires_refresh paths silently lose their fast-path
    // rejection. (Historical bug — fixed alongside this test.)
    expect(invalidTokens.has('tok-keep')).toBeTruthy()
    expect(invalidTokens.has('tw-keep')).toBeTruthy()
  })

  it('is a no-op when called with no client', async () => {
    await clearCacheForUser()
    expect(gsiHandlers.size).toBe(0)
  })
})
