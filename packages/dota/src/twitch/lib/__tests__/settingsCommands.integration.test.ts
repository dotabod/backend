import { beforeEach, describe, expect, it } from 'bun:test'
import { DBSettings } from '../../../settings.ts'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Mod commands that persist a setting via supabase.from('settings').upsert()
// (captured in state.upsertCalls).

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!setdelay', () => {
  it('rejects a non-numeric argument', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setdelay abc' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('persists the delay in milliseconds and confirms', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setdelay 5' }))
    expect(state.upsertCalls).toHaveLength(1)
    expect(state.upsertCalls[0].values).toMatchObject({ key: DBSettings.streamDelay, value: 5000 })
    expect(state.chatSayCalls[0].message).toContain('5')
  })

  it('clamps a delay above the 3000s maximum', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setdelay 9999' }))
    expect(state.upsertCalls[0].values).toMatchObject({ value: 3000 * 1000 })
  })

  it('treats 0 as removing the delay', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!setdelay 0' }))
    expect(state.upsertCalls[0].values).toMatchObject({ value: 0 })
    expect(state.chatSayCalls[0].message.toLowerCase()).toMatch(/remov|delay/)
  })
})

describe('!only', () => {
  it('reports disabled status when no args and rank-only is off', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!only' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('enables rank-only mode for a valid rank', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!only herald' }))
    expect(state.upsertCalls).toHaveLength(1)
    const value = JSON.parse(state.upsertCalls[0].values.value as string)
    expect(value).toMatchObject({ enabled: true, minimumRank: 'Herald' })
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/verify')
  })

  it('disables rank-only mode with "off"', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!only off' }))
    expect(state.upsertCalls).toHaveLength(1)
    const value = JSON.parse(state.upsertCalls[0].values.value as string)
    expect(value.enabled).toBe(false)
  })

  it('rejects an unrecognized rank', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!only notarank' }))
    expect(state.upsertCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(1)
  })
})

describe('!mute', () => {
  it('mutes by persisting chatter=false when it was on (the default) and announces it', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!mute' }))
    expect(state.upsertCalls).toHaveLength(1)
    expect(state.upsertCalls[0].values).toMatchObject({ key: DBSettings.chatter, value: false })
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('un-mutes by persisting chatter=true when it was already off', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!mute',
        clientOverrides: { settings: [{ key: DBSettings.chatter, value: false }] } as any,
      }),
    )
    expect(state.upsertCalls[0].values).toMatchObject({ key: DBSettings.chatter, value: true })
    expect(state.chatSayCalls).toHaveLength(1)
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!mute', permission: 0, userName: 'viewer' }),
    )
    expect(state.upsertCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(0)
  })
})
