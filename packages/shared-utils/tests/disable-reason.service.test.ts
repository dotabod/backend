import { beforeEach, describe, expect, it } from 'vitest'

import type { DisableReason } from '../src/disableReason/types'
import { resetUtilsState, utilsState } from './setup-mocks.ts'

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
    })

    expect(utilsState.upserts).toHaveLength(1)
    expect(utilsState.upserts[0].table).toBe('settings')
    expect(utilsState.upserts[0].values).toMatchObject({
      disable_reason: 'INVALID_TOKEN',
      key: 'someSetting',
      userId: 'user-1',
      value: false,
    })
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0].table).toBe('disable_notifications')
    expect(utilsState.inserts[0].values).toMatchObject({
      reason: 'INVALID_TOKEN',
      setting_key: 'someSetting',
      user_id: 'user-1',
    })
  })

  it('writes value:true when opts.disabledValue is true (inverted settings)', async () => {
    await trackDisableReason(
      'user-1',
      'commandDisable',
      'MANUAL_DISABLE' satisfies DisableReason,
      { disabled_by: 'mod1' },
      { disabledValue: true }
    )

    expect(utilsState.upserts[0].values).toMatchObject({
      disable_reason: 'MANUAL_DISABLE',
      key: 'commandDisable',
      value: true,
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
      auto_disabled_at: null,
      auto_disabled_by: null,
      disable_reason: null,
    })
    expect(settingsUpdate?.filters).toStrictEqual([
      { col: 'userId', method: 'eq', val: 'user-1' },
      { col: 'key', method: 'eq', val: 'someSetting' },
    ])

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(notifUpdate?.values).toMatchObject({ auto_resolved: false })
    expect(
      notifUpdate?.filters.some((f) => f.method === 'is' && f.col === 'resolved_at')
    ).toBeTruthy()
    // Without opts.reason, no reason filter is applied.
    expect(notifUpdate?.filters.some((f) => f.col === 'reason')).toBeFalsy()
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
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING'
      )
    ).toBeTruthy()
  })

  it('folds opts.enabledValue into the settings UPDATE (single write)', async () => {
    await trackResolveReason('user-1', 'commandDisable', false, { enabledValue: false })

    const settingsUpdate = utilsState.updates.find((u) => u.table === 'settings')
    expect(settingsUpdate?.values).toMatchObject({
      disable_reason: null,
      value: false,
    })
  })

  it('does not write value when opts.enabledValue is omitted', async () => {
    await trackResolveReason('user-1', 'someSetting')

    const settingsUpdate = utilsState.updates.find((u) => u.table === 'settings')
    expect(settingsUpdate?.values).not.toHaveProperty('value')
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
      { blocked_steam32_id: '12345' }
    )

    expect(utilsState.upserts).toHaveLength(0)
    expect(utilsState.updates).toHaveLength(0)
    expect(utilsState.inserts).toHaveLength(1)
    expect(utilsState.inserts[0].table).toBe('disable_notifications')
    expect(utilsState.inserts[0].values).toMatchObject({
      metadata: { blocked_steam32_id: '12345' },
      reason: 'ACCOUNT_SHARING',
      setting_key: 'commandDisable',
      user_id: 'user-1',
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
      utilsState.updates[0].filters.some((f) => f.method === 'is' && f.col === 'resolved_at')
    ).toBeTruthy()
  })

  it('filters by reason when opts.reason is provided', async () => {
    await resolveDisableNotifications('user-1', 'commandDisable', { reason: 'ACCOUNT_SHARING' })

    expect(
      utilsState.updates[0].filters.some(
        (f) => f.method === 'eq' && f.col === 'reason' && f.val === 'ACCOUNT_SHARING'
      )
    ).toBeTruthy()
  })
})
