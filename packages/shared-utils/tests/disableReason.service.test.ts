import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { DisableReason } from '../src/disableReason/types'
import { resetUtilsState, utilsState } from './setupMocks.ts'

const { trackDisableReason, trackResolveReason } = await import('../src/disableReason/service')

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

  it('logs an info entry on success', async () => {
    await trackDisableReason('user-1', 'someSetting', 'INVALID_TOKEN' satisfies DisableReason)
    expect(utilsState.loggerInfoCalls).toHaveLength(1)
    expect(utilsState.loggerInfoCalls[0].message).toContain('Tracked disable reason')
  })
})

describe('trackResolveReason', () => {
  it('clears disable_reason on settings and marks notifications resolved', async () => {
    await trackResolveReason('user-1', 'someSetting')

    // First update: settings row, clears disable_reason fields.
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

    // Second update: disable_notifications, sets resolved_at + auto_resolved.
    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(notifUpdate?.values).toMatchObject({ auto_resolved: false })
    expect(notifUpdate?.filters.some((f) => f.method === 'is' && f.col === 'resolved_at')).toBe(
      true,
    )
  })

  it('records auto_resolved=true when the flag is passed', async () => {
    await trackResolveReason('user-1', 'someSetting', true)

    const notifUpdate = utilsState.updates.find((u) => u.table === 'disable_notifications')
    expect(notifUpdate?.values).toMatchObject({ auto_resolved: true })
  })

  it('logs an info entry on success', async () => {
    await trackResolveReason('user-1', 'someSetting')
    expect(utilsState.loggerInfoCalls).toHaveLength(1)
    expect(utilsState.loggerInfoCalls[0].message).toContain('Resolved disable reason')
  })
})
