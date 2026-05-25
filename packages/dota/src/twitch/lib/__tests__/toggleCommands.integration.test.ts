import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
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
  it('routes to commandDisable.disable when currently enabled', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!toggle', userName: 'modUser' }))
    expect(state.upsertCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(0)
    expect(state.commandDisableCalls).toHaveLength(1)
    expect(state.commandDisableCalls[0]).toMatchObject({
      kind: 'disable',
      reason: 'MANUAL_DISABLE',
      metadata: { disabled_by: 'modUser', command: '!toggle' },
    })
  })

  it('routes to commandDisable.enable when currently disabled', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!toggle',
        clientOverrides: { settings: [{ key: DBSettings.commandDisable, value: true }] } as any,
      }),
    )
    expect(state.upsertCalls).toHaveLength(0)
    expect(state.chatSayCalls).toHaveLength(0)
    expect(state.commandDisableCalls).toHaveLength(1)
    expect(state.commandDisableCalls[0]).toMatchObject({ kind: 'enable' })
    expect((state.commandDisableCalls[0] as { opts?: unknown }).opts).toBeUndefined()
  })

  it('blocks viewers (permission below mod)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!toggle', permission: 0, userName: 'viewer' }),
    )
    expect(state.upsertCalls).toHaveLength(0)
    expect(state.commandDisableCalls).toHaveLength(0)
  })
})

describe('!today', () => {
  it('reports unknownSteam when there is no steam id', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!today', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(t('unknownSteam', { lng: 'en' }))
  })

  it('reports the multiAccount message when no steam id and multiAccount is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!today',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe(
      t('multiAccount', { lng: 'en', url: 'dotabod.com/dashboard/features' }),
    )
  })

  it('groups today matches into per-hero win/loss records', async () => {
    state.recentList = [
      { hero_name: 'npc_dota_hero_antimage', won: true },
      { hero_name: 'npc_dota_hero_antimage', won: false },
      { hero_name: 'npc_dota_hero_axe', won: true },
    ] as any
    await commandHandler.handleMessage(makeMessage({ content: '!today' }))
    expect(state.chatSayCalls).toHaveLength(1)
    const msg = state.chatSayCalls[0].message
    expect(msg).toContain('Anti-Mage 1W 1L')
    expect(msg).toContain('Axe 1W')
  })
})
