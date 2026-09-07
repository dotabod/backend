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
import { beforeEach, describe, expect, it } from 'vitest'

import { SETUP_SIGNAL_KEYS } from '../../dota/setup-signal-keys'
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
} from './watcher-mocks.ts'

beforeEach(() => {
  resetWatcherState()
  resetCaches()
  startWatcher()
})

describe('dota watcher: UPDATE:users banned_at null→set (ban)', () => {
  it('adds BOTH userId and providerAccountId to invalidTokens', async () => {
    seedClient({ name: 'banner', providerAccountId: 'tw-1', userId: 'u-1' })

    await fire('UPDATE', 'users', {
      new: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-1' },
      old: { banned_at: null, id: 'u-1' },
    })

    expect(invalidTokens.has('u-1')).toBeTruthy()
    expect(invalidTokens.has('tw-1')).toBeTruthy()
  })

  it('clears the in-memory GSIHandler so the next GSI POST cannot bypass the ban', async () => {
    seedClient({ name: 'banner2', providerAccountId: 'tw-2', userId: 'u-2' })
    expect(gsiHandlers.has('u-2')).toBeTruthy()

    await fire('UPDATE', 'users', {
      new: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-2' },
      old: { banned_at: null, id: 'u-2' },
    })

    expect(gsiHandlers.has('u-2')).toBeFalsy()
    // Sanity: clearCacheForUser actually ran (not just removed by a side path).
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-2')).toBeTruthy()
  })

  it('still adds userId even when there is no live client (no Account known)', async () => {
    // Cold ban: user has no GSIHandler in memory (e.g. they were never online
    // since the last deploy). Watcher should still invalidate the userId key —
    // providerAccountId is unknown but that's fine, getDBUser will resolve it
    // and add it on the next chat-side query.
    await fire('UPDATE', 'users', {
      new: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-cold' },
      old: { banned_at: null, id: 'u-cold' },
    })

    expect(invalidTokens.has('u-cold')).toBeTruthy()
    // No clearCacheForUser call because there's no client to clear.
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-cold')).toBeFalsy()
  })

  it('is idempotent when fired twice for the same transition (Realtime retry)', async () => {
    seedClient({ name: 'idem', providerAccountId: 'tw-3', userId: 'u-3' })

    const payload = {
      new: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-3' },
      old: { banned_at: null, id: 'u-3' },
    }
    await fire('UPDATE', 'users', payload)
    await fire('UPDATE', 'users', payload)

    // Token set is a Set (no dupes by definition) but the second fire should
    // also be a no-op for clearCacheForUser (gsiHandlers entry is already gone).
    expect(invalidTokens.has('u-3')).toBeTruthy()
    expect(invalidTokens.has('tw-3')).toBeTruthy()
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
    seedClient({ name: 'returning', providerAccountId: 'tw-banned', userId: 'u-banned' })

    await fire('UPDATE', 'users', {
      new: { banned_at: null, id: 'u-banned' },
      old: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-banned' },
    })

    expect(invalidTokens.has('u-banned')).toBeFalsy()
    expect(invalidTokens.has('tw-banned')).toBeFalsy()
  })

  it('still removes userId even when there is no live client to resolve providerAccountId', async () => {
    invalidTokens.add('u-cold-unban')

    await fire('UPDATE', 'users', {
      new: { banned_at: null, id: 'u-cold-unban' },
      old: { banned_at: '2026-05-24T00:00:00.000Z', id: 'u-cold-unban' },
    })

    expect(invalidTokens.has('u-cold-unban')).toBeFalsy()
  })
})

describe('dota watcher: UPDATE:users banned_at unchanged', () => {
  it('does not touch invalidTokens', async () => {
    seedClient({ name: 'stable', providerAccountId: 'tw-stable', userId: 'u-stable' })

    await fire('UPDATE', 'users', {
      new: { banned_at: null, id: 'u-stable', locale: 'en', mmr: 5000, name: 'stable' },
      old: { banned_at: null, id: 'u-stable', locale: 'en', mmr: 5000, name: 'stable' },
    })

    expect(invalidTokens.has('u-stable')).toBeFalsy()
    expect(invalidTokens.has('tw-stable')).toBeFalsy()
  })

  it('recomputes WL from the new stream start when the streamer comes online', async () => {
    const { client, handler } = seedClient({ userId: 'u-live' })

    await fire('UPDATE', 'users', {
      new: {
        banned_at: null,
        beta_tester: false,
        id: 'u-live',
        locale: 'en',
        mmr: 5000,
        name: 'live',
        stream_online: true,
        stream_start_date: '2026-09-04T12:00:00.000Z',
      },
      old: {
        banned_at: null,
        beta_tester: false,
        id: 'u-live',
        locale: 'en',
        mmr: 5000,
        name: 'live',
        stream_online: false,
        stream_start_date: null,
      },
    })

    expect(client.stream_start_date).toStrictEqual(new Date('2026-09-04T12:00:00.000Z'))
    expect(handler.emitWLUpdate).toHaveBeenCalledOnce()
  })
})

describe('dota watcher: UPDATE:accounts requires_refresh', () => {
  it('false→true: adds BOTH userId and providerAccountId to invalidTokens (after clearCacheForUser)', async () => {
    seedClient({ name: 'refreshing', providerAccountId: 'tw-r', userId: 'u-r' })

    await fire('UPDATE', 'accounts', {
      new: {
        access_token: 'a',
        providerAccountId: 'tw-r',
        requires_refresh: true,
        scope: 's',
        userId: 'u-r',
      },
      old: {
        access_token: 'a',
        providerAccountId: 'tw-r',
        requires_refresh: false,
        scope: 's',
        userId: 'u-r',
      },
    })

    expect(invalidTokens.has('u-r')).toBeTruthy()
    expect(invalidTokens.has('tw-r')).toBeTruthy()
    // The bug we fixed: clearCacheForUser used to delete these. Verify it ran
    // AND that the tokens still stuck.
    expect(watcherState.clearCacheCalls.some((c) => c.token === 'u-r')).toBeTruthy()
  })

  it('true→false: removes BOTH userId and providerAccountId from invalidTokens', async () => {
    invalidTokens.add('u-back')
    invalidTokens.add('tw-back')
    seedClient({ name: 'back', providerAccountId: 'tw-back', userId: 'u-back' })

    await fire('UPDATE', 'accounts', {
      new: {
        access_token: 'a-new',
        providerAccountId: 'tw-back',
        requires_refresh: false,
        scope: 's',
        userId: 'u-back',
      },
      old: {
        access_token: 'a-old',
        providerAccountId: 'tw-back',
        requires_refresh: true,
        scope: 's',
        userId: 'u-back',
      },
    })

    expect(invalidTokens.has('u-back')).toBeFalsy()
    expect(invalidTokens.has('tw-back')).toBeFalsy()
  })
})

describe('dota watcher: DELETE:users', () => {
  it('removes BOTH userId and providerAccountId from invalidTokens (allows re-onboard)', async () => {
    seedClient({ name: 'deleted', providerAccountId: 'tw-del', userId: 'u-del' })
    invalidTokens.add('u-del')
    invalidTokens.add('tw-del')

    await fire('DELETE', 'users', {
      old: { id: 'u-del' },
    })

    expect(invalidTokens.has('u-del')).toBeFalsy()
    expect(invalidTokens.has('tw-del')).toBeFalsy()
    expect(gsiHandlers.has('u-del')).toBeFalsy()
  })
})

describe('dota watcher: settings', () => {
  it.each(Object.values(SETUP_SIGNAL_KEYS))(
    'does not refresh overlays for setup signal updates: %s',
    async (key) => {
      seedClient({ userId: 'u-setup-signal' })

      await fire('*', 'settings', {
        new: { key, userId: 'u-setup-signal', value: true },
      })

      expect(watcherState.socketEmits).toHaveLength(0)
    }
  )

  it('keeps high-frequency activity updates out of info logs', async () => {
    seedClient({ userId: 'u-heartbeat' })

    await fire('*', 'settings', {
      new: { key: 'gsi_last_seen_at', userId: 'u-heartbeat', value: true },
    })

    expect(
      watcherState.loggerInfoCalls.filter(({ message }) => message.startsWith('[WATCHER SETTING]'))
    ).toHaveLength(0)
  })

  it('recomputes the overlay when the WL stats window changes', async () => {
    const { client, handler } = seedClient({ userId: 'u-wl' })

    await fire('*', 'settings', {
      new: { key: 'wlStatsDays', userId: 'u-wl', value: 30 },
    })

    expect(client.settings).toContainEqual({ key: 'wlStatsDays', value: 30 })
    expect(handler.emitWLUpdate).toHaveBeenCalledOnce()
    expect(watcherState.socketEmits).toContainEqual({
      event: 'refresh-settings',
      payload: 'wlStatsDays',
      room: 'u-wl',
    })
  })

  it('recomputes the overlay when the WL challenge start date changes', async () => {
    const { client, handler } = seedClient({ userId: 'u-wl-start' })

    await fire('*', 'settings', {
      new: { key: 'wlStatsStartDate', userId: 'u-wl-start', value: '2026-08-21' },
    })

    expect(client.settings).toContainEqual({ key: 'wlStatsStartDate', value: '2026-08-21' })
    expect(handler.emitWLUpdate).toHaveBeenCalledOnce()
  })
})

describe('dota watcher: win/loss adjustments', () => {
  it('recomputes every live WL surface after a manual correction is inserted', async () => {
    const { handler } = seedClient({ userId: 'u-wl-adjustment' })

    await fire('INSERT', 'win_loss_adjustments', {
      new: { user_id: 'u-wl-adjustment' },
    })

    expect(handler.emitWLUpdate).toHaveBeenCalledWith(true)
  })
})

describe('dota watcher: steam account relationship invalidation', () => {
  it('DELETE clears a cached connected claimant even when the row owner is absent', async () => {
    const { client, handler } = seedClient({
      multiAccount: 440_614_454,
      multiAccountRevalidatedAt: 123,
      name: 'claimant-name',
      providerAccountId: 'tw-claimant',
      userId: 'claimant',
    })
    invalidTokens.add('claimant')
    invalidTokens.add('tw-claimant')

    await fire('*', 'steam_accounts', {
      eventType: 'DELETE',
      new: {},
      old: {
        connectedUserIds: ['claimant'],
        id: 'steam-row',
        steam32Id: 440_614_454,
        userId: 'missing-owner',
      },
    })

    expect(gsiHandlers.has('claimant')).toBeFalsy()
    expect(client.multiAccount).toBeUndefined()
    expect(handler.multiAccountRevalidatedAt).toBeUndefined()
    expect(invalidTokens.has('claimant')).toBeFalsy()
    expect(invalidTokens.has('tw-claimant')).toBeFalsy()
    expect(twitchIdToToken.has('tw-claimant')).toBeFalsy()
    expect(twitchNameToToken.has('claimant-name')).toBeFalsy()
    expect(watcherState.clearCacheCalls.map((call) => call.token)).toStrictEqual(['claimant'])
  })

  it('DELETE clears the owner and connected claimants independently and is idempotent', async () => {
    seedClient({ providerAccountId: 'tw-owner', userId: 'owner' })
    seedClient({
      multiAccount: 12_345,
      providerAccountId: 'tw-claimant',
      userId: 'claimant',
    })
    for (const token of ['owner', 'tw-owner', 'claimant', 'tw-claimant']) {
      invalidTokens.add(token)
    }

    const payload = {
      eventType: 'DELETE',
      new: {},
      old: {
        connectedUserIds: ['claimant'],
        id: 'steam-row',
        steam32Id: 12_345,
        userId: 'owner',
      },
    }
    await fire('*', 'steam_accounts', payload)
    await fire('*', 'steam_accounts', payload)

    expect(gsiHandlers.has('owner')).toBeFalsy()
    expect(gsiHandlers.has('claimant')).toBeFalsy()
    expect(watcherState.clearCacheCalls.map((call) => call.token).sort()).toStrictEqual([
      'claimant',
      'owner',
    ])
    for (const token of ['owner', 'tw-owner', 'claimant', 'tw-claimant']) {
      expect(invalidTokens.has(token)).toBeFalsy()
    }
  })

  it('ownership-transfer UPDATE clears the previous owner and promoted claimant', async () => {
    seedClient({ providerAccountId: 'tw-old-owner', userId: 'old-owner' })
    seedClient({
      multiAccount: 777,
      multiAccountRevalidatedAt: 123,
      providerAccountId: 'tw-new-owner',
      userId: 'new-owner',
    })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      new: {
        connectedUserIds: [],
        id: 'steam-row',
        leaderboard_rank: null,
        mmr: 5000,
        name: 'account',
        steam32Id: 777,
        userId: 'new-owner',
      },
      old: {
        connectedUserIds: ['new-owner'],
        id: 'steam-row',
        leaderboard_rank: null,
        mmr: 5000,
        name: 'account',
        steam32Id: 777,
        userId: 'old-owner',
      },
    })

    expect(gsiHandlers.has('old-owner')).toBeFalsy()
    expect(gsiHandlers.has('new-owner')).toBeFalsy()
    expect(watcherState.clearCacheCalls.map((call) => call.token).sort()).toStrictEqual([
      'new-owner',
      'old-owner',
    ])
  })

  it('connectedUserIds removal clears only the removed claimant', async () => {
    seedClient({
      steamAccounts: [{ leaderboard_rank: null, mmr: 5000, name: 'account', steam32Id: 777 }],
      userId: 'owner',
    })
    seedClient({ multiAccount: 777, userId: 'removed' })
    seedClient({ multiAccount: 777, userId: 'remaining' })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      new: {
        connectedUserIds: ['remaining'],
        id: 'steam-row',
        leaderboard_rank: null,
        mmr: 5000,
        name: 'account',
        steam32Id: 777,
        userId: 'owner',
      },
      old: {
        connectedUserIds: ['removed', 'remaining'],
        id: 'steam-row',
        leaderboard_rank: null,
        mmr: 5000,
        name: 'account',
        steam32Id: 777,
        userId: 'owner',
      },
    })

    expect(gsiHandlers.has('owner')).toBeTruthy()
    expect(gsiHandlers.has('removed')).toBeFalsy()
    expect(gsiHandlers.has('remaining')).toBeTruthy()
    expect(watcherState.clearCacheCalls.map((call) => call.token)).toStrictEqual(['removed'])
  })

  it('ordinary MMR/profile UPDATE refreshes local data without evicting clients', async () => {
    const { client } = seedClient({
      steamAccounts: [{ leaderboard_rank: null, mmr: 5000, name: 'old', steam32Id: 777 }],
      userId: 'owner',
    })
    seedClient({ multiAccount: 777, userId: 'claimant' })

    await fire('*', 'steam_accounts', {
      eventType: 'UPDATE',
      new: {
        connectedUserIds: ['claimant'],
        id: 'steam-row',
        leaderboard_rank: 123,
        mmr: 5100,
        name: 'new',
        steam32Id: 777,
        userId: 'owner',
      },
      old: {
        connectedUserIds: ['claimant'],
        id: 'steam-row',
        leaderboard_rank: null,
        mmr: 5000,
        name: 'old',
        steam32Id: 777,
        userId: 'owner',
      },
    })

    expect(gsiHandlers.has('owner')).toBeTruthy()
    expect(gsiHandlers.has('claimant')).toBeTruthy()
    expect(watcherState.clearCacheCalls).toHaveLength(0)
    expect(client.SteamAccount[0]).toMatchObject({ leaderboard_rank: 123, mmr: 5100, name: 'new' })
  })
})
