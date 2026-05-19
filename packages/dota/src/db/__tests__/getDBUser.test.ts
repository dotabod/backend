import { beforeEach, describe, expect, it } from 'bun:test'
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

const { default: getDBUser } = await import('../getDBUser.js')

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
