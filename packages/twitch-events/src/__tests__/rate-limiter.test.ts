import { beforeEach, describe, expect, it } from 'vitest'

import { checkAndFixUserSubscriptions, fetchState, resetState } from './shared-mocks.ts'

beforeEach(() => {
  resetState()
  fetchState.queue = []
  fetchState.calls = []
})

describe(checkAndFixUserSubscriptions, () => {
  it('fetches the broadcaster subscriptions on the happy path', async () => {
    fetchState.queue = [{ json: { data: [{ id: 's1' }], total: 1 }, status: 200 }]
    await checkAndFixUserSubscriptions('111')
    expect(fetchState.calls.some((u) => u.includes('broadcaster_user_id=111'))).toBeTruthy()
  })

  it('returns gracefully on a non-200 response', async () => {
    fetchState.queue = [{ json: {}, status: 500 }]
    await checkAndFixUserSubscriptions('111')
    expect(fetchState.calls).toHaveLength(1)
  })
})
