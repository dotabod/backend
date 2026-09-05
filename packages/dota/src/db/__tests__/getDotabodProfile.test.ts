import { beforeEach, describe, expect, it } from 'vitest'

import { dbState, resetDbState } from './dbMocks.ts'

const { getDotabodProfileUrl } = await import('../../twitch/lib/getDotabodProfile')

const client = {
  SteamAccount: [{ steam32Id: 99_999 }],
  name: '#Streamer',
  steam32Id: 99_999,
} as any

describe('getDotabodProfileUrl', () => {
  beforeEach(() => {
    resetDbState()
  })

  it('returns the current streamer profile without a database lookup', async () => {
    await expect(getDotabodProfileUrl(client, 99_999)).resolves.toBe('dotabod.com/streamer')
  })

  it('resolves another tracked player through their Steam account', async () => {
    dbState.tableResults.steam_accounts = {
      data: { users: { name: 'OtherStreamer' } },
      error: null,
    }

    await expect(getDotabodProfileUrl(client, 88_888)).resolves.toBe('dotabod.com/otherstreamer')
  })

  it('returns null when the selected player has no Dotabod profile', async () => {
    dbState.tableResults.steam_accounts = { data: null, error: { message: 'not found' } }

    await expect(getDotabodProfileUrl(client, 88_888)).resolves.toBeNull()
  })
})
