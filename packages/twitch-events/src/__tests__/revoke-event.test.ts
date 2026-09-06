import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearSubscriptions,
  eventSubMap,
  executeRevoke,
  fetchState,
  resetState,
  seedSubscriptions,
  state,
  stopUserSubscriptions,
} from './shared-mocks.ts'

describe(stopUserSubscriptions, () => {
  beforeEach(() => {
    resetState()
    clearSubscriptions()
    fetchState.queue = []
    fetchState.calls = []
  })

  it('deletes each subscription via the API and clears the map entry', async () => {
    seedSubscriptions('111', ['stream.online', 'stream.offline'])

    await stopUserSubscriptions('111')

    expect({
      deleteCalls: fetchState.calls.filter((url) => url.includes('eventsub/subscriptions')).length,
      subscriptionsRemain: eventSubMap.has('111'),
    }).toStrictEqual({ deleteCalls: 2, subscriptionsRemain: false })
  })

  it('is a no-op when the user has no subscriptions', async () => {
    await stopUserSubscriptions('999')

    expect(fetchState.calls).toStrictEqual([])
  })
})

describe(executeRevoke, () => {
  beforeEach(() => {
    resetState()
    clearSubscriptions()
    fetchState.queue = []
    fetchState.calls = []
  })

  it('flags the account for refresh and disables the channel', async () => {
    state.dbUser = { userId: 'user-1' }
    state.dbSettings = []
    seedSubscriptions('222', ['stream.online'])

    await executeRevoke('222')

    expect({
      commandDisableCalls: state.commandDisableCalls,
      refreshUpdates: state.updates.filter(
        (update) => update.table === 'accounts' && update.values.requires_refresh === true
      ).length,
      settingsUpserts: state.upserts.filter(
        (upsert) => upsert.table === 'settings' && upsert.values.key === 'commandDisable'
      ).length,
    }).toStrictEqual({
      commandDisableCalls: [
        {
          kind: 'disable',
          metadata: {
            additional_info: 'User revoked app permissions on Twitch',
            requires_reauth: true,
          },
          reason: 'TOKEN_REVOKED',
          userId: 'user-1',
        },
      ],
      refreshUpdates: 1,
      settingsUpserts: 0,
    })
  })

  it('does not re-disable a channel that is already disabled', async () => {
    state.dbUser = { userId: 'user-1' }
    state.dbSettings = [{ key: 'commandDisable', value: true }]

    await executeRevoke('333')

    expect({
      commandDisableCalls: state.commandDisableCalls,
      settingsUpserts: state.upserts,
    }).toStrictEqual({ commandDisableCalls: [], settingsUpserts: [] })
  })
})
