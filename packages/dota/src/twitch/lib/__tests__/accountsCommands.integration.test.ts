import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { commandHandler, liveGsi, makeMessage, resetState, state } from './setupMocks.ts'

// gm/np/smurfs/lg call getAccountsFromMatch (owned by gsiMocks) only after an
// early steam32Id guard, so we cover that collision-safe guard branch here.
// geo short-circuits to the Valve-disabled message before getAccountsFromMatch,
// so its reachable paths are fully covered.
const multiAccount = t('multiAccount', { lng: 'en', url: 'dotabod.com/dashboard/features' })
const notPlaying = t('notPlaying', { emote: 'PauseChamp', lng: 'en' })

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

for (const cmd of ['gm', 'np', 'smurfs', 'lg']) {
  describe(`!${cmd}`, () => {
    it('reports unknownSteam when there is no steam id', async () => {
      await commandHandler.handleMessage(
        makeMessage({ content: `!${cmd}`, clientOverrides: { steam32Id: null } }),
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(t('unknownSteam', { lng: 'en' }))
    })

    it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
      await commandHandler.handleMessage(
        makeMessage({
          content: `!${cmd}`,
          clientOverrides: { steam32Id: null, multiAccount: true } as any,
        }),
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(multiAccount)
    })
  })
}

describe('!geo', () => {
  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!geo' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(notPlaying)
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!geo', clientOverrides: { gsi: liveGsi() } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('matchDataValveDisabled', { lng: 'en' }))
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!geo', permission: 0, userName: 'viewer' }),
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
