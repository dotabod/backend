import { beforeEach, describe, expect, it } from 'bun:test'
import { clearSubscriptions, resetState, state, subscribeToEvents } from './sharedMocks.ts'

beforeEach(() => {
  resetState()
  clearSubscriptions()
})

describe('subscribeToEvents', () => {
  it('bails out when no conduit ID is available', async () => {
    state.conduitId = ''
    state.accountIds = ['111']
    await subscribeToEvents()
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('bails out when there are no accounts to subscribe', async () => {
    state.accountIds = []
    await subscribeToEvents()
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('subscribes every account to all required event types', async () => {
    state.accountIds = ['111', '222']
    await subscribeToEvents()
    // 11 required types per account, no existing subs.
    expect(state.subscribeCalls).toHaveLength(22)
    const accounts = new Set(state.subscribeCalls.map((c) => c.userId))
    expect(accounts).toEqual(new Set(['111', '222']))
  })
})
