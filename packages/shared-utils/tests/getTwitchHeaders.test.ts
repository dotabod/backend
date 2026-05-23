import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { resetUtilsState, utilsState } from './setupMocks.ts'

const { getTwitchHeaders } = await import('../src/twitch/getTwitchHeaders')

beforeEach(() => {
  resetUtilsState()
})

describe('getTwitchHeaders', () => {
  it('uses the @twurple/auth app token when no twitchId is provided', async () => {
    utilsState.appToken = { accessToken: 'app-token-xyz' }
    const headers = await getTwitchHeaders(undefined, true)
    expect(headers.Authorization).toBe('Bearer app-token-xyz')
    expect(headers['Client-Id']).toBeDefined()
  })

  it('uses per-user tokens from supabase when a non-bot twitchId is provided', async () => {
    utilsState.selectSingle.accounts = {
      data: { access_token: 'user-tok-abc', refresh_token: 'r' },
      error: null,
    }
    const headers = await getTwitchHeaders('twitch-user-1', true)
    expect(headers.Authorization).toBe('Bearer user-tok-abc')
  })

  it('returns the cached headers within the refresh interval', async () => {
    utilsState.appToken = { accessToken: 'first-token' }
    const first = await getTwitchHeaders(undefined, true)
    expect(first.Authorization).toBe('Bearer first-token')

    // Flip the token. Without forceRefresh the cache should win.
    utilsState.appToken = { accessToken: 'second-token' }
    const second = await getTwitchHeaders(undefined, false)
    expect(second.Authorization).toBe('Bearer first-token')
  })

  it('bypasses the cache when forceRefresh=true', async () => {
    utilsState.appToken = { accessToken: 'first-token' }
    await getTwitchHeaders(undefined, true)

    utilsState.appToken = { accessToken: 'refreshed-token' }
    const refreshed = await getTwitchHeaders(undefined, true)
    expect(refreshed.Authorization).toBe('Bearer refreshed-token')
  })
})
