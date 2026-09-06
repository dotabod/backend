import { beforeEach, describe, expect, it } from 'vitest'

import {
  dbState,
  gsiHandlers,
  invalidTokens,
  lookingupToken,
  resetDbState,
  resetUserCaches,
  twitchIdToToken,
  twitchNameToToken,
} from './dbMocks.ts'

const { default: getDBUser } = await import('../getDBUser')

beforeEach(() => {
  resetDbState()
  resetUserCaches()
})

describe('getDBUser', () => {
  it('returns null with the invalidTokens reason when token is in the invalid set', async () => {
    invalidTokens.add('bad-token')

    const res = await getDBUser({ token: 'bad-token' })

    expect(res.result).toBeNull()
    expect(res.reason).toContain('invalidTokens')
  })

  it('returns the cached client when gsiHandlers already has the token', async () => {
    const cached = { name: 'cached-user', token: 'cached-token' } as any
    gsiHandlers.set('cached-token', { client: cached } as any)

    const res = await getDBUser({ token: 'cached-token' })

    expect(res.result).toBe(cached)
    expect(res.reason).toContain('found by token')
  })

  it('returns the cached client by twitchId via the twitchIdToToken map', async () => {
    const cached = { name: 'cached-user', token: 'tok-2' } as any
    twitchIdToToken.set('twitch-id-7', 'tok-2')
    gsiHandlers.set('tok-2', { client: cached } as any)

    const res = await getDBUser({ twitchId: 'twitch-id-7' })

    expect(res.result).toBe(cached)
  })

  it('returns the in-progress lookup result when the same token is already being looked up', async () => {
    lookingupToken.set('busy-token', true)

    const res = await getDBUser({ token: 'busy-token' })

    expect(res.result).toBeNull()
    expect(res.reason).toContain('currently being looked up')
  })

  it('marks the token invalid and returns null when the users table errors', async () => {
    dbState.tableResults.users = { data: null, error: { message: 'db down' } }

    const res = await getDBUser({ token: 'tok-3' })

    expect(res.result).toBeNull()
    expect(invalidTokens.has('tok-3')).toBeTruthy()
    expect(lookingupToken.has('tok-3')).toBeFalsy()
  })

  it('treats a missing token AND twitchId as an invalidTokens hit (empty string is pre-seeded)', async () => {
    // Production behavior: lookupToken collapses to '' which is one of the
    // pre-seeded falsy guards, so the invalidTokens.has check short-circuits
    // before reaching the dedicated "!lookupToken" branch.
    const res = await getDBUser({})
    expect(res.result).toBeNull()
    expect(res.reason).toContain('invalidTokens')
  })

  it('resolves userId from providerAccountId via the accounts table', async () => {
    dbState.tableResults.accounts = { data: { userId: 'user-9' }, error: null }
    dbState.tableResults.users = {
      data: {
        Account: { providerAccountId: 'tw-9', requires_refresh: false },
        SteamAccount: [],
        beta_tester: false,
        id: 'user-9',
        locale: 'en',
        mmr: 3000,
        name: 'FromTwitchId',
        settings: [],
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        subscriptions: [],
      },
      error: null,
    }
    const res = await getDBUser({ twitchId: 'tw-9' })
    expect(res.result?.name).toBe('FromTwitchId')
  })

  it('returns an error reason when the accounts lookup errors', async () => {
    dbState.tableResults.accounts = { data: null, error: { message: 'accounts down' } }
    const res = await getDBUser({ twitchId: 'tw-x' })
    expect(res.result).toBeNull()
    expect(res.reason).toContain('accounts down')
    expect(invalidTokens.has('tw-x')).toBeTruthy()
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed')
    ).toBeTruthy()
  })

  it('does not log an error when the accounts lookup returns 0 rows (PGRST116)', async () => {
    dbState.tableResults.accounts = {
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    }
    const res = await getDBUser({ twitchId: 'tw-stale' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tw-stale')).toBeTruthy()
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed')
    ).toBeFalsy()
  })

  it('does not log an error when the users lookup returns 0 rows (PGRST116)', async () => {
    dbState.tableResults.users = {
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    }
    const res = await getDBUser({ token: 'tok-stale' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tok-stale')).toBeTruthy()
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] users lookup failed')
    ).toBeFalsy()
  })

  it('marks transient (non-PGRST116) accounts errors in the cache but routes through addEphemeral so they do NOT persist across deploys', async () => {
    // Simulate a Supabase blip with a non-PGRST116 code — e.g., 503 / network reset.
    dbState.tableResults.accounts = {
      data: null,
      error: { code: 'PGRST500', message: 'service unavailable' },
    }
    const res = await getDBUser({ twitchId: 'tw-blip' })
    expect(res.result).toBeNull()
    // In-memory entry exists so we bound the log noise within the process.
    expect(invalidTokens.has('tw-blip')).toBeTruthy()
    // Real DB error is still alerted on.
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed')
    ).toBeTruthy()
  })

  it('marks transient (non-PGRST116) users errors in the cache but routes through addEphemeral', async () => {
    dbState.tableResults.users = {
      data: null,
      error: { code: 'PGRST500', message: 'service unavailable' },
    }
    const res = await getDBUser({ token: 'tok-blip' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tok-blip')).toBeTruthy()
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] users lookup failed')
    ).toBeTruthy()
  })

  it('returns "no userId" when the accounts row has no userId', async () => {
    dbState.tableResults.accounts = { data: { userId: null }, error: null }
    const res = await getDBUser({ twitchId: 'tw-y' })
    expect(res.result).toBeNull()
    expect(res.reason).toContain('No userId')
  })

  it('returns "no user" when the users row is empty', async () => {
    dbState.tableResults.users = { data: null, error: null }
    const res = await getDBUser({ token: 'tok-empty' })
    expect(res.result).toBeNull()
    expect(res.reason).toContain('No user')
  })

  it('returns "No Account found" without throwing or wedging the lookup token when the users row has no Account', async () => {
    dbState.tableResults.users = {
      data: {
        Account: [],
        SteamAccount: [],
        beta_tester: false,
        id: 'user-noacct',
        locale: 'en',
        mmr: 1,
        name: 'NoAccount',
        settings: [],
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        subscriptions: [],
      },
      error: null,
    }
    const res = await getDBUser({ token: 'tok-noacct' })
    expect(res.result).toBeUndefined()
    expect(res.reason).toContain('No Account found')
    expect(lookingupToken.has('tok-noacct')).toBeFalsy()
  })

  it('does not cache an account that requires a token refresh', async () => {
    dbState.tableResults.users = {
      data: {
        Account: { providerAccountId: 'tw-r', requires_refresh: true },
        SteamAccount: [],
        beta_tester: false,
        id: 'user-r',
        locale: 'en',
        mmr: 1,
        name: 'NeedsRefresh',
        settings: [],
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        subscriptions: [],
      },
      error: null,
    }
    const res = await getDBUser({ token: 'tok-r' })
    expect(res.result).toBeNull()
    expect(res.reason).toContain('requires refresh')
  })

  it('attaches the active subscription to the built client', async () => {
    dbState.tableResults.users = {
      data: {
        Account: { providerAccountId: 'tw-sub', requires_refresh: false },
        SteamAccount: [],
        beta_tester: false,
        id: 'user-sub',
        locale: 'en',
        mmr: 4000,
        name: 'Subbed',
        settings: [],
        steam32Id: 5,
        stream_online: false,
        stream_start_date: '2026-05-20T00:00:00.000Z',
        subscriptions: [{ id: 'sub-1', isGift: false, status: 'ACTIVE', tier: 'PRO' }],
      },
      error: null,
    }
    const res = await getDBUser({ token: 'tok-sub' })
    expect(res.result?.subscription).toMatchObject({ status: 'ACTIVE', tier: 'PRO' })
    expect(res.result?.stream_start_date).toBeInstanceOf(Date)
  })

  it('rejects a banned user, adds the token to invalidTokens, and surfaces the "banned" reason', async () => {
    dbState.tableResults.users = {
      data: {
        Account: { providerAccountId: 'tw-banned', requires_refresh: false },
        SteamAccount: [],
        banned_at: '2026-05-24T00:00:00.000Z',
        beta_tester: false,
        id: 'user-banned',
        locale: 'en',
        mmr: 1,
        name: 'BannedUser',
        settings: [],
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        subscriptions: [],
      },
      error: null,
    }
    const res = await getDBUser({ token: 'tok-banned' })
    expect(res.result).toBeNull()
    expect(res.reason).toContain('banned')
    expect(invalidTokens.has('tok-banned')).toBeTruthy()
    // gsiHandler must NOT be created for a banned user.
    expect(gsiHandlers.has('user-banned')).toBeFalsy()
  })

  it('builds and caches a SocketClient on a successful users lookup', async () => {
    dbState.tableResults.users = {
      data: {
        Account: {
          access_token: 'a',
          expires_at: null,
          expires_in: null,
          obtainment_timestamp: null,
          providerAccountId: 'twitch-1',
          refresh_token: 'r',
          requires_refresh: false,
          scope: null,
        },
        SteamAccount: [{ leaderboard_rank: 0, mmr: 5000, name: 'main', steam32Id: 99_999 }],
        beta_tester: false,
        id: 'user-1',
        locale: 'en',
        mmr: 5000,
        name: 'TheStreamer',
        settings: [],
        steam32Id: 99_999,
        stream_online: true,
        stream_start_date: null,
        subscriptions: [],
      },
      error: null,
    }

    const res = await getDBUser({ token: 'tok-4' })

    expect(res.result).not.toBeNull()
    expect(res.result?.name).toBe('TheStreamer')
    expect(res.reason).toContain('successfully retrieved')
    expect(gsiHandlers.has('user-1')).toBeTruthy()
    expect(twitchIdToToken.get('twitch-1')).toBe('user-1')
    expect(twitchNameToToken.get('thestreamer')).toBe('user-1')
  })
})
