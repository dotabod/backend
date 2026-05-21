import { beforeEach, describe, expect, it } from 'bun:test'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// gm/np/smurfs/lg call getAccountsFromMatch (owned by gsiMocks) only after an
// early steam32Id guard, so we cover that collision-safe guard branch here.
// geo short-circuits to the Valve-disabled message before getAccountsFromMatch,
// so its reachable paths are fully covered.

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
      expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
    })

    it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
      await commandHandler.handleMessage(
        makeMessage({
          content: `!${cmd}`,
          clientOverrides: { steam32Id: null, multiAccount: true } as any,
        }),
      )
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
    })
  })
}

describe('!geo', () => {
  it('reports notPlaying when there is no live match id', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!geo' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })

  it('reports the Valve-disabled message for a live non-spectator match', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!geo',
        clientOverrides: { gsi: { map: { matchid: '7777777777' } } as any },
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('Valve disabled')
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!geo', permission: 0, userName: 'viewer' }),
    )
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
