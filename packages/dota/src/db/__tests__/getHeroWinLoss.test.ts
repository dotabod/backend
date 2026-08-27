import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { dbState, resetDbState } from './dbMocks.ts'

const { getHeroWinLoss } = await import('../getHeroWinLoss')

describe('getHeroWinLoss', () => {
  beforeEach(() => {
    resetDbState()
  })

  it('counts the streamer hero record from tracked matches', async () => {
    dbState.tableResults.matches = {
      data: [{ won: true }, { won: false }, { won: true }],
      error: null,
    }

    await expect(
      getHeroWinLoss({ heroId: 1, isStreamer: true, steam32Id: 99_999, token: 'user-1' }),
    ).resolves.toEqual({ lose: 1, win: 2 })
  })

  it('requires a tracked Dotabod account for another player', async () => {
    dbState.tableResults.steam_accounts = { data: null, error: { message: 'not found' } }
    dbState.tableResults.matches = { data: [{ won: true }], error: null }

    await expect(
      getHeroWinLoss({ heroId: 1, isStreamer: false, steam32Id: 88_888, token: 'user-1' }),
    ).resolves.toEqual({ lose: 0, win: 0 })
  })

  it('uses another tracked player account to count their hero record', async () => {
    dbState.tableResults.steam_accounts = { data: { userId: 'user-2' }, error: null }
    dbState.tableResults.matches = {
      data: [{ won: false }, { won: false }, { won: true }],
      error: null,
    }

    await expect(
      getHeroWinLoss({ heroId: 1, isStreamer: false, steam32Id: 88_888, token: 'user-1' }),
    ).resolves.toEqual({ lose: 2, win: 1 })
  })
})
