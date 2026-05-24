// Locks in the contract that clearCacheForUser does NOT touch invalidTokens.
// Callers are responsible for invalidTokens — see packages/dota/src/db/watcher.ts.
//
// Why this exists: the historical impl deleted from invalidTokens, which
// silently undid the watcher's "add to invalidTokens" calls (because the add
// ran BEFORE clearCacheForUser). Moving that responsibility to callers means
// the order of operations no longer matters, but a future refactor could
// re-introduce the bug — this test guards against that.
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { buildSharedUtilsMock } from '../../__tests__/sharedMocks'

vi.doMock('@dotabod/shared-utils', () =>
  buildSharedUtilsMock({
    supabase: { from: () => ({}), rpc: async () => ({ data: [], error: null }) },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    getAuthProvider: () => ({ removeUser: () => undefined }),
  }),
)

// deleteRedisData touches redisClient + steam socket; stub the whole GSIHandler
// re-export surface that clearCacheForUser depends on.
vi.doMock('../GSIHandler', () => ({
  deleteRedisData: async () => undefined,
}))

const { clearCacheForUser } = await import('../clearCacheForUser')
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
    const client: any = {
      token: 'tok',
      name: 'name',
      Account: { providerAccountId: 'tw' },
    }
    gsiHandlers.set('tok', { client, disable: () => undefined } as any)
    twitchIdToToken.set('tw', 'tok')
    twitchNameToToken.set('name', 'tok')

    await clearCacheForUser(client)

    expect(gsiHandlers.has('tok')).toBe(false)
    expect(twitchIdToToken.has('tw')).toBe(false)
    expect(twitchNameToToken.has('name')).toBe(false)
  })

  it('does NOT remove entries from invalidTokens (caller controls that)', async () => {
    const client: any = {
      token: 'tok-keep',
      name: 'keep',
      Account: { providerAccountId: 'tw-keep' },
    }
    gsiHandlers.set('tok-keep', { client, disable: () => undefined } as any)
    invalidTokens.add('tok-keep')
    invalidTokens.add('tw-keep')

    await clearCacheForUser(client)

    // Both entries must survive. If clearCacheForUser deletes them, the
    // watcher's ban / requires_refresh paths silently lose their fast-path
    // rejection. (Historical bug — fixed alongside this test.)
    expect(invalidTokens.has('tok-keep')).toBe(true)
    expect(invalidTokens.has('tw-keep')).toBe(true)
  })

  it('is a no-op when called with no client', async () => {
    await clearCacheForUser(undefined)
    expect(gsiHandlers.size).toBe(0)
  })
})
