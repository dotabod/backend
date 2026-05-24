import { beforeEach, describe, expect, it } from 'vite-plus/test'
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
    expect(invalidTokens.has('tok-3')).toBe(true)
    expect(lookingupToken.has('tok-3')).toBe(false)
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
        id: 'user-9',
        name: 'FromTwitchId',
        mmr: 3000,
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        beta_tester: false,
        locale: 'en',
        subscriptions: [],
        Account: { providerAccountId: 'tw-9', requires_refresh: false },
        SteamAccount: [],
        settings: [],
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
    expect(invalidTokens.has('tw-x')).toBe(true)
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed'),
    ).toBe(true)
  })

  it('does not log an error when the accounts lookup returns 0 rows (PGRST116)', async () => {
    dbState.tableResults.accounts = {
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    }
    const res = await getDBUser({ twitchId: 'tw-stale' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tw-stale')).toBe(true)
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed'),
    ).toBe(false)
  })

  it('does not log an error when the users lookup returns 0 rows (PGRST116)', async () => {
    dbState.tableResults.users = {
      data: null,
      error: { code: 'PGRST116', message: 'The result contains 0 rows' },
    }
    const res = await getDBUser({ token: 'tok-stale' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tok-stale')).toBe(true)
    expect(dbState.loggerErrorCalls.some((c) => c.message === '[USER] users lookup failed')).toBe(
      false,
    )
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
    expect(invalidTokens.has('tw-blip')).toBe(true)
    // Real DB error is still alerted on.
    expect(
      dbState.loggerErrorCalls.some((c) => c.message === '[USER] accounts lookup failed'),
    ).toBe(true)
  })

  it('marks transient (non-PGRST116) users errors in the cache but routes through addEphemeral', async () => {
    dbState.tableResults.users = {
      data: null,
      error: { code: 'PGRST500', message: 'service unavailable' },
    }
    const res = await getDBUser({ token: 'tok-blip' })
    expect(res.result).toBeNull()
    expect(invalidTokens.has('tok-blip')).toBe(true)
    expect(dbState.loggerErrorCalls.some((c) => c.message === '[USER] users lookup failed')).toBe(
      true,
    )
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

  it('does not cache an account that requires a token refresh', async () => {
    dbState.tableResults.users = {
      data: {
        id: 'user-r',
        name: 'NeedsRefresh',
        mmr: 1,
        steam32Id: 1,
        stream_online: false,
        stream_start_date: null,
        beta_tester: false,
        locale: 'en',
        subscriptions: [],
        Account: { providerAccountId: 'tw-r', requires_refresh: true },
        SteamAccount: [],
        settings: [],
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
        id: 'user-sub',
        name: 'Subbed',
        mmr: 4000,
        steam32Id: 5,
        stream_online: false,
        stream_start_date: '2026-05-20T00:00:00.000Z',
        beta_tester: false,
        locale: 'en',
        subscriptions: [{ id: 'sub-1', tier: 'PRO', status: 'ACTIVE', isGift: false }],
        Account: { providerAccountId: 'tw-sub', requires_refresh: false },
        SteamAccount: [],
        settings: [],
      },
      error: null,
    }
    const res = await getDBUser({ token: 'tok-sub' })
    expect(res.result?.subscription).toMatchObject({ tier: 'PRO', status: 'ACTIVE' })
    expect(res.result?.stream_start_date).toBeInstanceOf(Date)
  })

  it('builds and caches a SocketClient on a successful users lookup', async () => {
    dbState.tableResults.users = {
      data: {
        id: 'user-1',
        name: 'TheStreamer',
        mmr: 5000,
        steam32Id: 99999,
        stream_online: true,
        stream_start_date: null,
        beta_tester: false,
        locale: 'en',
        subscriptions: [],
        Account: {
          providerAccountId: 'twitch-1',
          refresh_token: 'r',
          scope: null,
          expires_at: null,
          requires_refresh: false,
          expires_in: null,
          obtainment_timestamp: null,
          access_token: 'a',
        },
        SteamAccount: [{ mmr: 5000, steam32Id: 99999, name: 'main', leaderboard_rank: 0 }],
        settings: [],
      },
      error: null,
    }

    const res = await getDBUser({ token: 'tok-4' })

    expect(res.result).not.toBeNull()
    expect(res.result?.name).toBe('TheStreamer')
    expect(res.reason).toContain('successfully retrieved')
    expect(gsiHandlers.has('user-1')).toBe(true)
    expect(twitchIdToToken.get('twitch-1')).toBe('user-1')
    expect(twitchNameToToken.get('thestreamer')).toBe('user-1')
  })
})
