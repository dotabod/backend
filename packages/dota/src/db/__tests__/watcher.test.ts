// Regression coverage for packages/dota/src/db/watcher.ts. Two recent features
// land here:
//   - aecc8e78 "feat(ban): gate GSI/onboarding/watchers on users.banned_at" —
//     UPDATE:users handler invalidates tokens + clears the GSIHandler.
//   - 896487cd "invalidTokens: persist negative cache to Redis with 24h TTL" —
//     UPDATE:accounts requires_refresh handler mirrors both userId AND
//     providerAccountId into invalidTokens.
//
// Before these tests existed, neither path had ANY test coverage and a
// subtle ordering bug (invalidTokens.add → clearCacheForUser → invalidTokens
// silently re-deleted) shipped to prod. See watcher.ts and clearCacheForUser.ts.
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  fire,
  gsiHandlers,
  invalidTokens,
  resetCaches,
  resetWatcherState,
  seedClient,
  startWatcher,
  twitchIdToToken,
  twitchNameToToken,
  watcherState,
} from './watcherMocks.ts'

beforeEach(() => {
  resetWatcherState()
  resetCaches()
  startWatcher()
})

describe('dota watcher: UPDATE:users banned_at null→set (ban)', () => {
  it('adds BOTH userId and providerAccountId to invalidTokens', async () => {
    seedClient({ userId: 'u-1', providerAccountId: 'tw-1', name: 'banner' })

    await fire('UPDATE', 'users', {
      new: { id: 'u-1', banned_at: '2026-05-24T00:00:00.000Z' },
      old: { id: 'u-1', banned_at: null },
    })

    expect(invalidTokens.has('u-1')).toBe(true)
    expect(invalidTokens.has('tw-1')).toBe(true)
  })

  it('clears the in-memory GSIHandler so the next GSI POST cannot bypass the ban', async () => {
    seedClient({ userId: 'u-2', providerAccountId: 'tw-2', name: 'banner2' })
    expect(gsiHandlers.has('u-2')).toBe(true)

    await fire('UPDATE', 'users', {
      new: { id: 'u-2', banned_at: '2026-05-24T00:00:00.000Z' },
      old: { id: 'u-2', banned_at: null },
    })

    expect(gsiHandlers.has('u-2')).toBe(false)
    // Sanity: clearCacheForUser actually ran (not just removed by a side path).
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-2')).toBe(true)
  })

  it('still adds userId even when there is no live client (no Account known)', async () => {
    // Cold ban: user has no GSIHandler in memory (e.g. they were never online
    // since the last deploy). Watcher should still invalidate the userId key —
    // providerAccountId is unknown but that's fine, getDBUser will resolve it
    // and add it on the next chat-side query.
    await fire('UPDATE', 'users', {
      new: { id: 'u-cold', banned_at: '2026-05-24T00:00:00.000Z' },
      old: { id: 'u-cold', banned_at: null },
    })

    expect(invalidTokens.has('u-cold')).toBe(true)
    // No clearCacheForUser call because there's no client to clear.
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-cold')).toBe(false)
  })

  it('is idempotent when fired twice for the same transition (Realtime retry)', async () => {
    seedClient({ userId: 'u-3', providerAccountId: 'tw-3', name: 'idem' })

    const payload = {
      new: { id: 'u-3', banned_at: '2026-05-24T00:00:00.000Z' },
      old: { id: 'u-3', banned_at: null },
    }
    await fire('UPDATE', 'users', payload)
    await fire('UPDATE', 'users', payload)

    // Token set is a Set (no dupes by definition) but the second fire should
    // also be a no-op for clearCacheForUser (gsiHandlers entry is already gone).
    expect(invalidTokens.has('u-3')).toBe(true)
    expect(invalidTokens.has('tw-3')).toBe(true)
    expect(watcherState.clearCacheCalls).toHaveLength(1)
  })
})

describe('dota watcher: UPDATE:users banned_at set→null (unban)', () => {
  it('removes BOTH userId and providerAccountId from invalidTokens', async () => {
    // Simulate the post-ban state: tokens in the negative cache, no live
    // client (it was cleared on ban).
    invalidTokens.add('u-banned')
    invalidTokens.add('tw-banned')
    // Re-seed a client so the unban handler can look up providerAccountId.
    seedClient({ userId: 'u-banned', providerAccountId: 'tw-banned', name: 'returning' })

    await fire('UPDATE', 'users', {
      new: { id: 'u-banned', banned_at: null },
      old: { id: 'u-banned', banned_at: '2026-05-24T00:00:00.000Z' },
    })

    expect(invalidTokens.has('u-banned')).toBe(false)
    expect(invalidTokens.has('tw-banned')).toBe(false)
  })

  it('still removes userId even when there is no live client to resolve providerAccountId', async () => {
    invalidTokens.add('u-cold-unban')

    await fire('UPDATE', 'users', {
      new: { id: 'u-cold-unban', banned_at: null },
      old: { id: 'u-cold-unban', banned_at: '2026-05-24T00:00:00.000Z' },
    })

    expect(invalidTokens.has('u-cold-unban')).toBe(false)
  })
})

describe('dota watcher: UPDATE:users banned_at unchanged', () => {
  it('does not touch invalidTokens', async () => {
    seedClient({ userId: 'u-stable', providerAccountId: 'tw-stable', name: 'stable' })

    await fire('UPDATE', 'users', {
      new: { id: 'u-stable', banned_at: null, name: 'stable', locale: 'en', mmr: 5000 },
      old: { id: 'u-stable', banned_at: null, name: 'stable', locale: 'en', mmr: 5000 },
    })

    expect(invalidTokens.has('u-stable')).toBe(false)
    expect(invalidTokens.has('tw-stable')).toBe(false)
  })

  it('recomputes WL from the new stream start when the streamer comes online', async () => {
    const { client, handler } = seedClient({ userId: 'u-live' })

    await fire('UPDATE', 'users', {
      new: {
        id: 'u-live',
        banned_at: null,
        beta_tester: false,
        locale: 'en',
        mmr: 5000,
        name: 'live',
        stream_online: true,
        stream_start_date: '2026-09-04T12:00:00.000Z',
      },
      old: {
        id: 'u-live',
        banned_at: null,
        beta_tester: false,
        locale: 'en',
        mmr: 5000,
        name: 'live',
        stream_online: false,
        stream_start_date: null,
      },
    })

    expect(client.stream_start_date).toEqual(new Date('2026-09-04T12:00:00.000Z'))
    expect(handler.emitWLUpdate).toHaveBeenCalledOnce()
  })
})

describe('dota watcher: UPDATE:accounts requires_refresh', () => {
  it('false→true: adds BOTH userId and providerAccountId to invalidTokens (after clearCacheForUser)', async () => {
    seedClient({ userId: 'u-r', providerAccountId: 'tw-r', name: 'refreshing' })

    await fire('UPDATE', 'accounts', {
      new: {
        userId: 'u-r',
        providerAccountId: 'tw-r',
        requires_refresh: true,
        scope: 's',
        access_token: 'a',
      },
      old: {
        userId: 'u-r',
        providerAccountId: 'tw-r',
        requires_refresh: false,
        scope: 's',
        access_token: 'a',
      },
    })

    expect(invalidTokens.has('u-r')).toBe(true)
    expect(invalidTokens.has('tw-r')).toBe(true)
    // The bug we fixed: clearCacheForUser used to delete these. Verify it ran
    // AND that the tokens still stuck.
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-r')).toBe(true)
  })

  it('true→false: removes BOTH userId and providerAccountId from invalidTokens', async () => {
    invalidTokens.add('u-back')
    invalidTokens.add('tw-back')
    seedClient({ userId: 'u-back', providerAccountId: 'tw-back', name: 'back' })

    await fire('UPDATE', 'accounts', {
      new: {
        userId: 'u-back',
        providerAccountId: 'tw-back',
        requires_refresh: false,
        scope: 's',
        access_token: 'a-new',
      },
      old: {
        userId: 'u-back',
        providerAccountId: 'tw-back',
        requires_refresh: true,
        scope: 's',
        access_token: 'a-old',
      },
    })

    expect(invalidTokens.has('u-back')).toBe(false)
    expect(invalidTokens.has('tw-back')).toBe(false)
  })
})

describe('dota watcher: DELETE:users', () => {
  it('removes BOTH userId and providerAccountId from invalidTokens (allows re-onboard)', async () => {
    seedClient({ userId: 'u-del', providerAccountId: 'tw-del', name: 'deleted' })
    invalidTokens.add('u-del')
    invalidTokens.add('tw-del')

    await fire('DELETE', 'users', {
      old: { id: 'u-del' },
    })

    expect(invalidTokens.has('u-del')).toBe(false)
    expect(invalidTokens.has('tw-del')).toBe(false)
    expect(gsiHandlers.has('u-del')).toBe(false)
  })
})

describe('dota watcher: settings', () => {
  it('recomputes the overlay when the WL stats window changes', async () => {
    const { client, handler } = seedClient({ userId: 'u-wl' })

    await fire('*', 'settings', {
      new: { key: 'wlStatsDays', userId: 'u-wl', value: 30 },
    })

    expect(client.settings).toContainEqual({ key: 'wlStatsDays', value: 30 })
    expect(handler.emitWLUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('dota watcher: steam account relationship invalidation', () => {
  it('DELETE clears a cached connected claimant even when the row owner is absent', async () => {
    const { client, handler } = seedClient({
      userId: 'claimant',
      providerAccountId: 'tw-claimant',
      name: 'claimant-name',
      multiAccount: 440614454,
      multiAccountRevalidatedAt: 123,
    })
    invalidTokens.add('claimant')
    invalidTokens.add('tw-claimant')

    await fire('*', 'steam_accounts', {
      eventType: 'DELETE',
      old: {
        id: 'steam-row',
        userId: 'missing-owner',
        steam32Id: 440614454,
        connectedUserIds: ['claimant'],
      },
      new: {},
    })

    expect(gsiHandlers.has('claimant')).toBe(false)
    expect(client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(invalidTokens.has('claimant')).toBe(false)
    expect(invalidTokens.has('tw-claimant')).toBe(false)
    expect(twitchIdToToken.has('tw-claimant')).toBe(false)
    expect(twitchNameToToken.has('claimant-name')).toBe(false)
    expect(watcherState.clearCacheCalls.map((call) => call.token)).toEqual(['claimant'])
  })

  it('DELETE clears the owner and connected claimants independently and is idempotent', async () => {
    seedClient({ userId: 'owner', providerAccountId: 'tw-owner' })
    seedClient({
      userId: 'claimant',
      providerAccountId: 'tw-claimant',
      multiAccount: 12345,
    })
    for (const token of ['owner', 'tw-owner', 'claimant', 'tw-claimant']) {
      invalidTokens.add(token)
    }

    const payload = {
      eventType: 'DELETE',
      old: {
        id: 'steam-row',
        userId: 'owner',
        steam32Id: 12345,
        connectedUserIds: ['claimant'],
      },
      new: {},
    }
    await fire('*', 'steam_accounts', payload)
    await fire('*', 'steam_accounts', payload)

    expect(gsiHandlers.has('owner')).toBe(false)
    expect(gsiHandlers.has('claimant')).toBe(false)
    expect(watcherState.clearCacheCalls.map((call) => call.token).sort()).toEqual([
      'claimant',
      'owner',
    ])
    for (const token of ['owner', 'tw-owner', 'claimant', 'tw-claimant']) {
      expect(invalidTokens.has(token)).toBe(false)
    }
  })

  it('ownership-transfer UPDATE clears the previous owner and promoted claimant', async () => {
    seedClient({ userId: 'old-owner', providerAccountId: 'tw-old-owner' })
    seedClient({
      userId: 'new-owner',
      providerAccountId: 'tw-new-owner',
      multiAccount: 777,
      multiAccountRevalidatedAt: 123,
    })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      old: {
        id: 'steam-row',
        userId: 'old-owner',
        steam32Id: 777,
        connectedUserIds: ['new-owner'],
        mmr: 5000,
        name: 'account',
        leaderboard_rank: null,
      },
      new: {
        id: 'steam-row',
        userId: 'new-owner',
        steam32Id: 777,
        connectedUserIds: [],
        mmr: 5000,
        name: 'account',
        leaderboard_rank: null,
      },
    })

    expect(gsiHandlers.has('old-owner')).toBe(false)
    expect(gsiHandlers.has('new-owner')).toBe(false)
    expect(watcherState.clearCacheCalls.map((call) => call.token).sort()).toEqual([
      'new-owner',
      'old-owner',
    ])
  })

  it('connectedUserIds removal clears only the removed claimant', async () => {
    seedClient({
      userId: 'owner',
      steamAccounts: [{ steam32Id: 777, mmr: 5000, name: 'account', leaderboard_rank: null }],
    })
    seedClient({ userId: 'removed', multiAccount: 777 })
    seedClient({ userId: 'remaining', multiAccount: 777 })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      old: {
        id: 'steam-row',
        userId: 'owner',
        steam32Id: 777,
        connectedUserIds: ['removed', 'remaining'],
        mmr: 5000,
        name: 'account',
        leaderboard_rank: null,
      },
      new: {
        id: 'steam-row',
        userId: 'owner',
        steam32Id: 777,
        connectedUserIds: ['remaining'],
        mmr: 5000,
        name: 'account',
        leaderboard_rank: null,
      },
    })

    expect(gsiHandlers.has('owner')).toBe(true)
    expect(gsiHandlers.has('removed')).toBe(false)
    expect(gsiHandlers.has('remaining')).toBe(true)
    expect(watcherState.clearCacheCalls.map((call) => call.token)).toEqual(['removed'])
  })

  it('ordinary MMR/profile UPDATE refreshes local data without evicting clients', async () => {
    const { client } = seedClient({
      userId: 'owner',
      steamAccounts: [{ steam32Id: 777, mmr: 5000, name: 'old', leaderboard_rank: null }],
    })
    seedClient({ userId: 'claimant', multiAccount: 777 })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      old: {
        id: 'steam-row',
        userId: 'owner',
        steam32Id: 777,
        connectedUserIds: ['claimant'],
        mmr: 5000,
        name: 'old',
        leaderboard_rank: null,
      },
      new: {
        id: 'steam-row',
        userId: 'owner',
        steam32Id: 777,
        connectedUserIds: ['claimant'],
        mmr: 5100,
        name: 'new',
        leaderboard_rank: 123,
      },
    })

    expect(gsiHandlers.has('owner')).toBe(true)
    expect(gsiHandlers.has('claimant')).toBe(true)
    expect(watcherState.clearCacheCalls).toHaveLength(0)
    expect(client.SteamAccount[0]).toMatchObject({ mmr: 5100, name: 'new', leaderboard_rank: 123 })
  })
})
