import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
import { flushAsync } from '../../../__tests__/sharedMocks.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// !won / !lost are manual match-resolution commands. With no pending resolution
// and no recent resolved match in state, resolveByMostRecentMatch returns false
// and the command falls back to the no-pending message.

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

for (const cmd of ['won', 'lost']) {
  describe(`!${cmd}`, () => {
    it('rejects a non-numeric match id argument', async () => {
      await commandHandler.handleMessage(makeMessage({ content: `!${cmd} notamatch` }))
      await flushAsync()
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(
        t('bets.retroactiveMatchNotFound', {
          matchId: 'notamatch',
          emote: 'PauseChamp',
          lng: 'en',
        }),
      )
    })

    it('reports no pending resolution when nothing is waiting and no recent match exists', async () => {
      await commandHandler.handleMessage(makeMessage({ content: `!${cmd}` }))
      await flushAsync()
      expect(state.chatSayCalls).toHaveLength(1)
      expect(state.chatSayCalls[0].message).toBe(
        t('bets.noPendingResolution', { emote: 'PauseChamp', lng: 'en' }),
      )
    })

    it('blocks viewers (permission below mod)', async () => {
      await commandHandler.handleMessage(
        makeMessage({ content: `!${cmd}`, permission: 0, userName: 'viewer' }),
      )
      await flushAsync()
      expect(state.chatSayCalls).toHaveLength(0)
    })
  })
}
