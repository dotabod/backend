import type { TwitchEventType } from '@dotabod/shared-utils/event-sub'
import { beforeEach, describe, expect, it } from 'vitest'

import type { EventSubStatus } from '../interfaces.ts'
import {
  clearSubscriptions,
  eventSubMap,
  fetchExistingSubscriptions,
  fetchState,
  stopUserSubscriptions,
} from './shared-mocks.ts'

interface SubscriptionFixture {
  condition: {
    broadcaster_user_id?: string
    client_id?: string
  }
  id: string
  status: EventSubStatus
  transport: { conduit_id?: string; method: string }
  type: TwitchEventType
}

const sub = (overrides: Partial<SubscriptionFixture> = {}) =>
  ({
    condition: { broadcaster_user_id: '111' },
    id: 's1',
    status: 'enabled',
    transport: { conduit_id: 'conduit-1', method: 'conduit' },
    type: 'stream.online',
    ...overrides,
  }) satisfies SubscriptionFixture

describe(fetchExistingSubscriptions, () => {
  beforeEach(() => {
    clearSubscriptions()
    fetchState.queue = []
    fetchState.calls = []
  })

  it('stores fetched subscriptions in eventSubMap keyed by broadcaster', async () => {
    fetchState.queue = [
      {
        json: { data: [sub({ id: 's1', type: 'stream.online' })], pagination: {}, total: 1 },
        status: 200,
      },
    ]
    await fetchExistingSubscriptions('conduit-1')
    expect(eventSubMap.get('111')).toBeDefined()
    expect(eventSubMap.get('111')?.['stream.online']).toMatchObject({
      id: 's1',
      status: 'enabled',
    })
  })

  it('follows pagination cursors across pages', async () => {
    fetchState.queue = [
      {
        json: {
          data: [sub({ condition: { broadcaster_user_id: '111' }, id: 's1' })],
          pagination: { cursor: 'next' },
        },
        status: 200,
      },
      {
        json: {
          data: [
            sub({ condition: { broadcaster_user_id: '222' }, id: 's2', type: 'stream.offline' }),
          ],
          pagination: {},
        },
        status: 200,
      },
    ]
    await fetchExistingSubscriptions('conduit-1')
    expect(fetchState.calls).toHaveLength(2)
    expect(fetchState.calls[1]).toContain('after=next')
    expect(eventSubMap.get('111')).toBeDefined()
    expect(eventSubMap.get('222')).toBeDefined()
  })

  it('queues webhook + broadcaster-less subscriptions for cleanup', async () => {
    fetchState.queue = [
      {
        json: {
          data: [
            sub({ id: 'webhook-1', transport: { method: 'webhook' } }),
            sub({ condition: {}, id: 'orphan-1' }),
          ],
          pagination: {},
        },
        status: 200,
      },
    ]
    await expect(fetchExistingSubscriptions('conduit-1')).resolves.toStrictEqual([
      'webhook-1',
      'orphan-1',
    ])
  })

  it('ignores a paginated subscription revoked while the inventory is loading', async () => {
    fetchState.queue = [{ json: { data: [sub()] }, status: 200 }]

    const refresh = fetchExistingSubscriptions('conduit-1')
    await stopUserSubscriptions('111')
    await refresh

    expect(eventSubMap.has('111')).toBeFalsy()
  })

  it('replaces stale inventory and excludes disabled and previous-conduit subscriptions', async () => {
    fetchState.queue = [
      { json: { data: [sub()] }, status: 200 },
      {
        json: {
          data: [
            sub({ id: 'old', transport: { conduit_id: 'obsolete', method: 'conduit' } }),
            sub({ id: 'revoked', status: 'authorization_revoked' }),
          ],
        },
        status: 200,
      },
    ]

    await fetchExistingSubscriptions('conduit-1')
    await expect(fetchExistingSubscriptions('conduit-1')).resolves.toStrictEqual(['old', 'revoked'])
    expect(eventSubMap.has('111')).toBeFalsy()
  })

  it('does not queue app-level auth grant/revoke subscriptions for cleanup', async () => {
    fetchState.queue = [
      {
        json: {
          data: [
            sub({
              condition: { client_id: 'cid' },
              id: 'auth-grant-1',
              type: 'user.authorization.grant',
            }),
            sub({
              condition: { client_id: 'cid' },
              id: 'auth-revoke-1',
              type: 'user.authorization.revoke',
            }),
          ],
          pagination: {},
        },
        status: 200,
      },
    ]
    await expect(fetchExistingSubscriptions('conduit-1')).resolves.toStrictEqual([])
  })
})
