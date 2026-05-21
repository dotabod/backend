import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearSubscriptions,
  eventSubMap,
  fetchExistingSubscriptions,
  fetchState,
  subsToCleanup,
} from './sharedMocks.ts'

const sub = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  status: 'enabled',
  type: 'stream.online',
  transport: { method: 'conduit' },
  condition: { broadcaster_user_id: '111' },
  ...overrides,
})

beforeEach(() => {
  clearSubscriptions()
  subsToCleanup.length = 0
  fetchState.queue = []
  fetchState.calls = []
})

describe('fetchExistingSubscriptions', () => {
  it('stores fetched subscriptions in eventSubMap keyed by broadcaster', async () => {
    fetchState.queue = [
      { json: { data: [sub({ id: 's1', type: 'stream.online' })], pagination: {}, total: 1 } },
    ]
    await fetchExistingSubscriptions()
    expect(eventSubMap['111']).toBeDefined()
    expect(eventSubMap['111']['stream.online']).toMatchObject({ id: 's1', status: 'enabled' })
  })

  it('follows pagination cursors across pages', async () => {
    fetchState.queue = [
      {
        json: {
          data: [sub({ id: 's1', condition: { broadcaster_user_id: '111' } })],
          pagination: { cursor: 'next' },
        },
      },
      {
        json: {
          data: [
            sub({ id: 's2', type: 'stream.offline', condition: { broadcaster_user_id: '222' } }),
          ],
          pagination: {},
        },
      },
    ]
    await fetchExistingSubscriptions()
    expect(fetchState.calls).toHaveLength(2)
    expect(fetchState.calls[1]).toContain('after=next')
    expect(eventSubMap['111']).toBeDefined()
    expect(eventSubMap['222']).toBeDefined()
  })

  it('queues webhook + broadcaster-less subscriptions for cleanup', async () => {
    fetchState.queue = [
      {
        json: {
          data: [
            sub({ id: 'webhook-1', transport: { method: 'webhook' } }),
            sub({ id: 'orphan-1', condition: {} }),
          ],
          pagination: {},
        },
      },
    ]
    await fetchExistingSubscriptions()
    expect(subsToCleanup).toContain('webhook-1')
    expect(subsToCleanup).toContain('orphan-1')
  })
})
