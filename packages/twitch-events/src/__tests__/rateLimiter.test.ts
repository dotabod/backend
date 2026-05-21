import { beforeEach, describe, expect, it } from 'bun:test'
import { checkAndFixUserSubscriptions, fetchState, resetState } from './sharedMocks.ts'

beforeEach(() => {
  resetState()
  fetchState.queue = []
  fetchState.calls = []
})

describe('checkAndFixUserSubscriptions', () => {
  it('fetches the broadcaster subscriptions on the happy path', async () => {
    fetchState.queue = [{ status: 200, json: { data: [{ id: 's1' }], total: 1 } }]
    await checkAndFixUserSubscriptions('111')
    expect(fetchState.calls.some((u) => u.includes('broadcaster_user_id=111'))).toBe(true)
  })

  it('returns gracefully on a non-200 response', async () => {
    fetchState.queue = [{ status: 500, json: {} }]
    await checkAndFixUserSubscriptions('111')
    expect(fetchState.calls).toHaveLength(1)
  })
})
