import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  flushMacrotasks,
  offlineEvent,
  onlineEvent,
  onlineEvents,
  resetState,
  state,
  updateUserEvent,
} from '../../__tests__/sharedMocks.ts'
import type { TwitchOfflineEvent } from '../offlineEvent.ts'
import type { TwitchOnlineEvent } from '../onlineEvent.ts'
import type { TwitchUserUpdateEvent } from '../updateUserEvent.ts'

const realSetTimeout = globalThis.setTimeout

beforeEach(() => {
  resetState()
  onlineEvents.clear()
})

describe('onlineEvent', () => {
  const evt = (id = 'b1', started_at = '2026-05-20T00:00:00.000Z') => ({
    payload: { event: { broadcaster_user_id: id, started_at } as TwitchOnlineEvent },
  })

  it('records the online timestamp and marks the user online', async () => {
    onlineEvent(evt('b1'))
    expect(onlineEvents.has('b1')).toBe(true)

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

describe('offlineEvent', () => {
  const evt = (id = 'b1') => ({
    payload: { event: { broadcaster_user_id: id } as TwitchOfflineEvent },
  })

  // offlineEvent debounces with a real setTimeout(..., 10000); fire it instantly.
  beforeEach(() => {
    globalThis.setTimeout = ((cb: () => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
  })
  afterEach(() => {
    globalThis.setTimeout = realSetTimeout
  })

  // Drain the async handler's microtasks via the real timer.
  const drain = () => new Promise<void>((r) => realSetTimeout(r, 5))

  it('marks the user offline when there was no recent online event', async () => {
    offlineEvent(evt('b1'))
    await drain()
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0].values).toMatchObject({ stream_online: false })
  })

  it('ignores a false-positive offline shortly after going online', async () => {
    onlineEvents.set('b1', new Date())
    offlineEvent(evt('b1'))
    await drain()
    expect(state.userUpdates).toHaveLength(0)
  })
})

describe('updateUserEvent', () => {
  it('updates name/displayName, filtering out falsy fields', async () => {
    updateUserEvent({
      payload: {
        event: {
          user_id: 'b1',
          user_login: 'newname',
          user_name: 'NewName',
        } as TwitchUserUpdateEvent,
      },
    })
    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(1)
    expect(state.userUpdates[0].values).toEqual({ name: 'newname', displayName: 'NewName' })
  })

  it('does not update when the account is not found', async () => {
    state.dbAccount = null
    updateUserEvent({
      payload: {
        event: {
          user_id: 'b1',
          user_login: 'newname',
          user_name: 'NewName',
        } as TwitchUserUpdateEvent,
      },
    })
    await flushMacrotasks()
    expect(state.userUpdates).toHaveLength(0)
  })
})
