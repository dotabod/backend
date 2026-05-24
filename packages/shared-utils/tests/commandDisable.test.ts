import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { resetUtilsState, utilsState } from './setupMocks.ts'

const { commandDisable } = await import('../src/disableReason/commandDisable')

beforeEach(() => {
  resetUtilsState()
})

describe('commandDisable.disable', () => {
  it('upserts settings.value=true (inverted: true = disabled) + audit row', async () => {
    await commandDisable.disable('user-1', 'MANUAL_DISABLE', { disabled_by: 'mod1' } as any)

    expect(utilsState.upserts).toHaveLength(1)
    expect(utilsState.upserts[0]).toMatchObject({
      table: 'settings',
      values: {
        userId: 'user-1',
        key: 'commandDisable',
        value: true,
        disable_reason: 'MANUAL_DISABLE',
      },
    })
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0]).toMatchObject({
      table: 'disable_notifications',
      values: { user_id: 'user-1', setting_key: 'commandDisable', reason: 'MANUAL_DISABLE' },
    })
  })
})

describe('commandDisable.enable', () => {
  it('writes settings.value=false in the same UPDATE that clears disable_* (single write)', async () => {
    await commandDisable.enable('user-1')

    const settingsUpdate = utilsState.updates.find((u) => u.table === 'settings')
    expect(settingsUpdate?.values).toMatchObject({
      value: false,
      disable_reason: null,
      auto_disabled_at: null,
    })
    // No separate settings upsert — the value flip is folded in.
    expect(utilsState.upserts.filter((u) => u.table === 'settings')).toHaveLength(0)
  })

  it('passes opts.reason through to narrow the audit-row resolve', async () => {
    await commandDisable.enable('user-1', { reason: 'ACCOUNT_SHARING' })

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(
      notifUpdate?.filters.some(
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING',
      ),
    ).toBe(true)
  })
})

describe('commandDisable.recordNotification', () => {
  it('inserts an audit row without touching settings', async () => {
    await commandDisable.recordNotification('user-1', 'ACCOUNT_SHARING', { foo: 'bar' } as any)

    expect(utilsState.upserts).toHaveLength(0)
    expect(utilsState.updates).toHaveLength(0)
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0]).toMatchObject({
      table: 'disable_notifications',
      values: { user_id: 'user-1', setting_key: 'commandDisable', reason: 'ACCOUNT_SHARING' },
    })
  })
})
