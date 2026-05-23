import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { resetUtilsState, utilsState } from './setupMocks.ts'

const { botStatus, checkBotStatus } = await import('../src/twitch/botBanStatus')

beforeEach(() => {
  resetUtilsState()
  // Force the cooldown to expire so each test can drive the real DB lookup.
  botStatus.isBanned = false
  botStatus.lastChecked = 0
})

describe('checkBotStatus', () => {
  it('returns the cached isBanned within the cooldown window', async () => {
    botStatus.isBanned = true
    botStatus.lastChecked = Date.now()

    const res = await checkBotStatus()

    expect(res).toBe(true)
    // No DB lookup happened, so no error log.
    expect(utilsState.loggerErrorCalls).toHaveLength(0)
  })

  it('returns true (banned) when tokens are missing', async () => {
    utilsState.selectSingle.accounts = { data: null, error: { message: 'no row' } }

    const res = await checkBotStatus()

    expect(res).toBe(true)
    expect(botStatus.isBanned).toBe(true)
  })

  it('returns true (banned) when tokens require refresh', async () => {
    utilsState.selectSingle.accounts = {
      data: { access_token: 'a', refresh_token: 'r', requires_refresh: true },
      error: null,
    }

    const res = await checkBotStatus()

    expect(res).toBe(true)
    expect(botStatus.isBanned).toBe(true)
  })

  it('returns false (not banned) when tokens are valid and current', async () => {
    utilsState.selectSingle.accounts = {
      data: { access_token: 'a', refresh_token: 'r', requires_refresh: false },
      error: null,
    }

    const res = await checkBotStatus()

    expect(res).toBe(false)
    expect(botStatus.isBanned).toBe(false)
  })
})
