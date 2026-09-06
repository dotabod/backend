import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  flushMacrotasks,
  offlineEvent,
  onlineEvent,
  onlineEvents,
  resetState,
  state,
  updateUserEvent,
} from '../../__tests__/shared-mocks.ts'
import type { TwitchOfflineEvent } from '../offline-event.ts'
import type { TwitchOnlineEvent } from '../online-event.ts'
import type { TwitchUserUpdateEvent } from '../update-user-event.ts'

beforeEach(() => {
  resetState()
  onlineEvents.clear()
})

describe(onlineEvent, () => {
  const evt = (id = 'b1', started_at = '2026-05-20T00:00:00.000Z') => ({
    payload: {
      event: {
        broadcaster_user_id: id,
        broadcaster_user_login: 'streamer',
        broadcaster_user_name: 'Streamer',
        id: 'stream-1',
        started_at,
        type: 'live',
      } satisfies TwitchOnlineEvent,
    },
  })

  it('records the online timestamp and marks the user online', async () => {
    onlineEvent(evt('b1'))
    expect(onlineEvents.has('b1')).toBeTruthy()

    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0]).toMatchObject({
      values: { stream_online: true, stream_start_date: '2026-05-20T00:00:00.000Z' },
      whereId: 'user-1',
    })
  })

  it('does not update users when the account is not found', async () => {
    state.dbAccount = null
    onlineEvent(evt('b1'))
    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(0)
  })
})

describe(offlineEvent, () => {
  const evt = (id = 'b1') => ({
    payload: {
      event: {
        broadcaster_user_id: id,
        broadcaster_user_login: 'streamer',
        broadcaster_user_name: 'Streamer',
      } satisfies TwitchOfflineEvent,
    },
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const drain = async () => {
    await vi.runAllTimersAsync()
  }

  it('marks the user offline when there was no recent online event', async () => {
    offlineEvent(evt('b1'))
    await drain()
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0].values).toMatchObject({ stream_online: false })
    expect(state.logInfo).toContainEqual({
      message: 'updated offline event',
      meta: { twitchId: 'b1' },
    })
    expect(state.logInfo.some((entry) => entry.message === 'updated online event')).toBeFalsy()
  })

  it('ignores a false-positive offline shortly after going online', async () => {
    onlineEvents.set('b1', new Date())
    offlineEvent(evt('b1'))
    await drain()
    expect(state.userUpdates).toHaveLength(0)
  })
})

describe(updateUserEvent, () => {
  const evt = (): { payload: { event: TwitchUserUpdateEvent } } => ({
    payload: {
      event: {
        description: '',
        user_id: 'b1',
        user_login: 'newname',
        user_name: 'NewName',
      },
    },
  })

  it('updates name/displayName, filtering out falsy fields', async () => {
    updateUserEvent(evt())
    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0].values).toStrictEqual({ displayName: 'NewName', name: 'newname' })
  })

  it('does not update when the account is not found', async () => {
    state.dbAccount = null
    updateUserEvent(evt())
    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(0)
  })
})
