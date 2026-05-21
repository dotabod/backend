import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearSubscriptions,
  eventSubMap,
  fetchState,
  resetState,
  runSubscriptionHealthCheck,
  seedSubscriptions,
  state,
} from '../../__tests__/sharedMocks.ts'

const CRITICAL = ['stream.online', 'stream.offline', 'user.update', 'channel.chat.message'] as const
const SECONDARY = [
  'channel.prediction.begin',
  'channel.prediction.progress',
  'channel.prediction.lock',
  'channel.prediction.end',
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end',
] as const
const ALL = [...CRITICAL, ...SECONDARY]

describe('runSubscriptionHealthCheck', () => {
  beforeEach(() => {
    resetState()
    clearSubscriptions()
    // fetchState is process-wide; reset so a prior file's queued response can't leak in.
    fetchState.queue = []
    fetchState.calls = []
  })

  it('throws when no conduit ID is available', async () => {
    state.conduitId = ''
    state.accountIds = ['111']
    await expect(runSubscriptionHealthCheck()).rejects.toThrow('No valid conduit ID')
  })

  it('throws when there are no user accounts', async () => {
    state.accountIds = []
    await expect(runSubscriptionHealthCheck()).rejects.toThrow('No user accounts found')
  })

  it('reports no issues when every subscription already exists', async () => {
    state.accountIds = ['111']
    seedSubscriptions('111', ALL as any)

    const result = await runSubscriptionHealthCheck()

    expect(result.usersWithIssues).toBe(0)
    expect(result.fixedSubscriptions).toBe(0)
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('fixes all missing critical and secondary subscriptions', async () => {
    state.accountIds = ['111']
    seedSubscriptions('111', []) // entry exists but has no types -> all missing

    const result = await runSubscriptionHealthCheck()

    expect(result.usersWithIssues).toBe(1)
    expect(result.criticalFixCount).toBe(CRITICAL.length)
    expect(result.secondaryFixCount).toBe(SECONDARY.length)
    expect(result.fixedSubscriptions).toBe(ALL.length)
    expect(result.errorCount).toBe(0)
  })

  it('skips channel.chat.message subscriptions when the bot is banned', async () => {
    state.isBanned = true
    state.accountIds = ['111']
    seedSubscriptions('111', [])

    const result = await runSubscriptionHealthCheck()

    const subscribedTypes = state.subscribeCalls.map((c) => c.type)
    expect(subscribedTypes).not.toContain('channel.chat.message')
    expect(result.criticalFixCount).toBe(CRITICAL.length - 1)
  })

  it('counts errors when a subscription reports failure without throwing', async () => {
    state.accountIds = ['111']
    seedSubscriptions('111', [])
    state.subscribeResult = (_userId, type) => type !== 'stream.online'

    const result = await runSubscriptionHealthCheck()

    expect(result.errorCount).toBe(1)
    expect(result.criticalFixCount).toBe(CRITICAL.length - 1)
  })

  it('aggregates thrown errors into userErrors', async () => {
    state.accountIds = ['111']
    seedSubscriptions('111', [])
    state.subscribeResult = () => {
      throw new Error('twitch 500')
    }

    const result = await runSubscriptionHealthCheck()

    expect(result.errorCount).toBe(ALL.length)
    expect(result.userErrors['twitch 500']).toBe(ALL.length)
    expect(result.fixedSubscriptions).toBe(0)
  })

  it('fetches existing subscriptions from the API when the cache is empty', async () => {
    state.accountIds = ['111']
    // eventSubMap empty (cleared in beforeEach) -> triggers the API fetch path.
    fetchState.queue = [
      {
        status: 200,
        json: {
          data: [
            {
              id: 's1',
              status: 'enabled',
              type: 'stream.online',
              condition: { broadcaster_user_id: '111' },
            },
          ],
          pagination: {},
        },
      },
    ]

    await runSubscriptionHealthCheck()

    expect(fetchState.calls.some((u) => u.includes('eventsub/subscriptions'))).toBe(true)
    // The fetched stream.online sub was loaded into the cache for that broadcaster.
    expect(eventSubMap['111']?.['stream.online']).toMatchObject({ id: 's1' })
  })
})
