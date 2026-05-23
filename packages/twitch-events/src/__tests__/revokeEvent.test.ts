import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  clearSubscriptions,
  eventSubMap,
  fetchState,
  resetState,
  revokeEvent,
  seedSubscriptions,
  state,
  stopUserSubscriptions,
} from './sharedMocks.ts'

const realSetTimeout = globalThis.setTimeout

beforeEach(() => {
  resetState()
  clearSubscriptions()
  fetchState.queue = []
  fetchState.calls = []
})
afterEach(() => {
  globalThis.setTimeout = realSetTimeout
})

describe('stopUserSubscriptions', () => {
  it('deletes each subscription via the API and clears the map entry', async () => {
    seedSubscriptions('111', ['stream.online', 'stream.offline'])
    await stopUserSubscriptions('111')
    expect(fetchState.calls.filter((u) => u.includes('eventsub/subscriptions'))).toHaveLength(2)
    expect(eventSubMap['111']).toBeUndefined()
  })

  it('is a no-op when the user has no subscriptions', async () => {
    await stopUserSubscriptions('999')
    expect(fetchState.calls).toHaveLength(0)
  })
})

describe('revokeEvent', () => {
  // The handler debounces with setTimeout(..., 3000); fire it immediately.
  beforeEach(() => {
    globalThis.setTimeout = ((cb: () => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
  })

  it('flags the account for refresh and disables the channel after debounce', async () => {
    state.dbUser = { userId: 'user-1' }
    state.dbSettings = []
    seedSubscriptions('222', ['stream.online'])

    await revokeEvent({ providerAccountId: '222' })
    await new Promise((r) => realSetTimeout(r, 5))

    expect(
      state.updates.some((u) => u.table === 'accounts' && u.values.requires_refresh === true),
    ).toBe(true)
    expect(
      state.upserts.some((u) => u.table === 'settings' && u.values.key === 'commandDisable'),
    ).toBe(true)
  })

  it('does not re-disable a channel that is already disabled', async () => {
    state.dbUser = { userId: 'user-1' }
    state.dbSettings = [{ key: 'commandDisable', value: true }]

    await revokeEvent({ providerAccountId: '333' })
    await new Promise((r) => realSetTimeout(r, 5))

    expect(state.upserts).toHaveLength(0)
  })
})
