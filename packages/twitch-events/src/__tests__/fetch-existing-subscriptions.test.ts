import { beforeEach, describe, expect, it } from 'vitest'

import type { EventSubStatus } from '../interfaces.ts'
import type { TwitchEventTypes } from '../twitch-event-types.ts'
import {
  clearSubscriptions,
  eventSubMap,
  fetchExistingSubscriptions,
  fetchState,
  subsToCleanup,
} from './shared-mocks.ts'

interface SubscriptionFixture {
  condition: {
    broadcaster_user_id?: string
    client_id?: string
  }
  id: string
  status: EventSubStatus
  transport: { method: string }
  type: keyof TwitchEventTypes
}

const sub = (overrides: Partial<SubscriptionFixture> = {}) =>
  ({
    condition: { broadcaster_user_id: '111' },
    id: 's1',
    status: 'enabled',
    transport: { method: 'conduit' },
    type: 'stream.online',
    ...overrides,
  }) satisfies SubscriptionFixture

describe(fetchExistingSubscriptions, () => {
  beforeEach(() => {
    clearSubscriptions()
    subsToCleanup.length = 0
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
    await fetchExistingSubscriptions()
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
    await fetchExistingSubscriptions()
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
    await fetchExistingSubscriptions()
    expect(subsToCleanup).toContain('webhook-1')
    expect(subsToCleanup).toContain('orphan-1')
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
    await fetchExistingSubscriptions()
    expect(subsToCleanup).toHaveLength(0)
  })
})
