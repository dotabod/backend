import { beforeEach, describe, expect, it } from 'bun:test'
import { flushAsync } from '../../../__tests__/sharedMocks.ts'
import { DBSettings } from '../../../settings.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Mod commands that flip a persisted flag (beta -> users.update, toggle ->
// settings.upsert) plus the no-steam branches of !today.

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!beta', () => {
  it('flips beta_tester and announces it', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!beta' }))
    await flushAsync()
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].values).toMatchObject({ beta_tester: true })
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!beta', permission: 0, userName: 'viewer' }),
    )
    await flushAsync()
    expect(state.updateCalls).toHaveLength(0)
  })
})

describe('!toggle', () => {
  it('persists the inverted commandDisable flag (no chat output)', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!toggle' }))
    expect(state.upsertCalls).toHaveLength(1)
    expect(state.upsertCalls[0].values).toMatchObject({
      key: DBSettings.commandDisable,
      value: true,
    })
    expect(state.chatSayCalls).toHaveLength(0)
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!toggle', permission: 0, userName: 'viewer' }),
    )
    expect(state.upsertCalls).toHaveLength(0)
  })
})

describe('!today', () => {
  it('reports unknownSteam when there is no steam id', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!today', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
  })

  it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!today',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })
})
