import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { DisableReason } from '../src/disableReason/types'
import { resetUtilsState, utilsState } from './setupMocks.ts'

const {
  trackDisableReason,
  trackResolveReason,
  recordDisableNotification,
  resolveDisableNotifications,
} = await import('../src/disableReason/service')

beforeEach(() => {
  resetUtilsState()
})

describe('trackDisableReason', () => {
  it('upserts the settings row and inserts a disable_notifications row', async () => {
    await trackDisableReason('user-1', 'someSetting', 'INVALID_TOKEN' satisfies DisableReason, {
      foo: 'bar',
    } as any)

    expect(utilsState.upserts).toHaveLength(1)
    expect(utilsState.upserts[0].table).toBe('settings')
    expect(utilsState.upserts[0].values).toMatchObject({
      userId: 'user-1',
      key: 'someSetting',
      value: false,
      disable_reason: 'INVALID_TOKEN',
    })
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0].table).toBe('disable_notifications')
    expect(utilsState.inserts[0].values).toMatchObject({
      user_id: 'user-1',
      setting_key: 'someSetting',
      reason: 'INVALID_TOKEN',
    })
  })

  it('writes value:true when opts.disabledValue is true (inverted settings)', async () => {
    await trackDisableReason(
      'user-1',
      'commandDisable',
      'MANUAL_DISABLE' satisfies DisableReason,
      { disabled_by: 'mod1' } as any,
      { disabledValue: true },
    )

    expect(utilsState.upserts[0].values).toMatchObject({
      key: 'commandDisable',
      value: true,
      disable_reason: 'MANUAL_DISABLE',
    })
  })

  it('logs an info entry on success', async () => {
    await trackDisableReason('user-1', 'someSetting', 'INVALID_TOKEN' satisfies DisableReason)
    expect(utilsState.loggerInfoCalls).toHaveLength(1)
    expect(utilsState.loggerInfoCalls[0].message).toContain('Tracked disable reason')
  })
})

describe('trackResolveReason', () => {
  it('clears disable_reason on settings and marks notifications resolved', async () => {
    await trackResolveReason('user-1', 'someSetting')

    const settingsUpdate = utilsState.updates.find((u) => u.table === 'settings')
    expect(settingsUpdate?.values).toMatchObject({
      disable_reason: null,
      auto_disabled_at: null,
      auto_disabled_by: null,
    })
    expect(settingsUpdate?.filters).toEqual([
      { method: 'eq', col: 'userId', val: 'user-1' },
      { method: 'eq', col: 'key', val: 'someSetting' },
    ])

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(notifUpdate?.values).toMatchObject({ auto_resolved: false })
    expect(notifUpdate?.filters.some((f) => f.method === 'is' && f.col === 'resolved_at')).toBe(
      true,
    )
    // Without opts.reason, no reason filter is applied.
    expect(notifUpdate?.filters.some((f) => f.col === 'reason')).toBe(false)
  })

  it('records auto_resolved=true when the flag is passed', async () => {
    await trackResolveReason('user-1', 'someSetting', true)

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(notifUpdate?.values).toMatchObject({ auto_resolved: true })
  })

  it('narrows the resolve to a specific reason when opts.reason is passed', async () => {
    await trackResolveReason('user-1', 'commandDisable', false, { reason: 'ACCOUNT_SHARING' })

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(
      notifUpdate?.filters.some(
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING',
      ),
    ).toBe(true)
  })

  it('logs an info entry on success', async () => {
    await trackResolveReason('user-1', 'someSetting')
    expect(utilsState.loggerInfoCalls).toHaveLength(1)
    expect(utilsState.loggerInfoCalls[0].message).toContain('Resolved disable reason')
  })
})

describe('recordDisableNotification', () => {
  it('inserts an audit row without touching settings', async () => {
    await recordDisableNotification(
      'user-1',
      'commandDisable',
      'ACCOUNT_SHARING' satisfies DisableReason,
      { blocked_steam32_id: '12345' } as any,
    )

    expect(utilsState.upserts).toHaveLength(0)
    expect(utilsState.updates).toHaveLength(0)
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0].table).toBe('disable_notifications')
    expect(utilsState.inserts[0].values).toMatchObject({
      user_id: 'user-1',
      setting_key: 'commandDisable',
      reason: 'ACCOUNT_SHARING',
      metadata: { blocked_steam32_id: '12345' },
    })
  })
})

describe('resolveDisableNotifications', () => {
  it('resolves open rows without touching settings', async () => {
    await resolveDisableNotifications('user-1', 'commandDisable')

    expect(utilsState.upserts).toHaveLength(0)
    expect(utilsState.updates).toHaveLength(1)
    expect(utilsState.updates[0].table).toBe('disable_notifications')
    expect(utilsState.updates[0].values).toMatchObject({ auto_resolved: false })
    expect(
      utilsState.updates[0].filters.some((f) => f.method === 'is' && f.col === 'resolved_at'),
    ).toBe(true)
  })

  it('filters by reason when opts.reason is provided', async () => {
    await resolveDisableNotifications('user-1', 'commandDisable', { reason: 'ACCOUNT_SHARING' })

    expect(
      utilsState.updates[0].filters.some(
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING',
      ),
    ).toBe(true)
  })
})
