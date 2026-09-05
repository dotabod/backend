import { beforeEach, describe, expect, it } from 'vitest'

import { resetUtilsState, utilsState } from './setupMocks.ts'

const { commandDisable } = await import('../src/disableReason/commandDisable')

beforeEach(() => {
  resetUtilsState()
})

describe('commandDisable.disable', () => {
  it('upserts settings.value=true (inverted: true = disabled) + audit row', async () => {
    await commandDisable.disable('user-1', 'MANUAL_DISABLE', { disabled_by: 'mod1' })

    expect(utilsState.upserts).toHaveLength(1)
    expect(utilsState.upserts[0]).toMatchObject({
      table: 'settings',
      values: {
        disable_reason: 'MANUAL_DISABLE',
        key: 'commandDisable',
        userId: 'user-1',
        value: true,
      },
    })
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0]).toMatchObject({
      table: 'disable_notifications',
      values: { reason: 'MANUAL_DISABLE', setting_key: 'commandDisable', user_id: 'user-1' },
    })
  })
})

describe('commandDisable.enable', () => {
  it('writes settings.value=false in the same UPDATE that clears disable_* (single write)', async () => {
    await commandDisable.enable('user-1')

    const settingsUpdate = utilsState.updates.find((u) => u.table === 'settings')
    expect(settingsUpdate?.values).toMatchObject({
      auto_disabled_at: null,
      disable_reason: null,
      value: false,
    })
    // No separate settings upsert — the value flip is folded in.
    expect(utilsState.upserts.filter((u) => u.table === 'settings')).toHaveLength(0)
  })

  it('passes opts.reason through to narrow the audit-row resolve', async () => {
    await commandDisable.enable('user-1', { reason: 'ACCOUNT_SHARING' })

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(
      notifUpdate?.filters.some(
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING'
      )
    ).toBeTruthy()
  })
})

describe('commandDisable.recordNotification', () => {
  it('inserts an audit row without touching settings', async () => {
    await commandDisable.recordNotification('user-1', 'ACCOUNT_SHARING', { foo: 'bar' })

    expect(utilsState.upserts).toHaveLength(0)
    expect(utilsState.updates).toHaveLength(0)
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0]).toMatchObject({
      table: 'disable_notifications',
      values: { reason: 'ACCOUNT_SHARING', setting_key: 'commandDisable', user_id: 'user-1' },
    })
  })
})
