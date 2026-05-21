import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from 'i18next'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!clearsharing', () => {
  it('deletes the active-steam-ids redis key and confirms success', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!clearsharing' }))
    expect(state.redisDelCalls).toContain('token:token-abc:activeSteam32Ids')
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('clearsharing.success', { lng: 'en' }))
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!clearsharing', permission: 0, userName: 'viewer' }),
    )
    expect(state.redisDelCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(0)
  })
})

describe('!lgs', () => {
  it('reports unknownSteam when there is no steam id', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!lgs', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('unknownSteam', { lng: 'en' }))
  })

  it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!lgs',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('multiAccount', { lng: 'en', url: 'dotabod.com/dashboard/features' }),
    )
  })
})
