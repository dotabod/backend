import { t } from 'i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { commandHandler, liveGsi, makeMessage, resetState, state } from './setup-mocks.ts'

// gm/np/smurfs/lg call MatchDataService (owned by setupMocks) only after an
// early steam32Id guard, so we cover that collision-safe guard branch here.
// geo short-circuits to the Valve-disabled message before the roster lookup,
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
        makeMessage({ clientOverrides: { steam32Id: null }, content: `!${cmd}` })
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(t('unknownSteam', { lng: 'en' }))
    })

    it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
      await commandHandler.handleMessage(
        makeMessage({
          clientOverrides: { multiAccount: true, steam32Id: null } as any,
          content: `!${cmd}`,
        })
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

  it('reports countries for a SourceTV-backed live non-spectator match', async () => {
    state.delayedGame = {
      match: { match_id: '7777777777' },
      players: [
        { accountid: 100, heroid: 1 },
        { accountid: 200, heroid: 2 },
      ],
    }
    state.steamPlayerSummaries = [
      { account_id: 100, country_code: 'SE', persona_name: 'One' },
      { account_id: 200, country_code: 'US', persona_name: 'Two' },
    ]

    await commandHandler.handleMessage(
      makeMessage({ clientOverrides: { gsi: liveGsi() }, content: '!geo' })
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('🇸🇪 · 🇺🇸')
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!geo', permission: 0, userName: 'viewer' })
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
