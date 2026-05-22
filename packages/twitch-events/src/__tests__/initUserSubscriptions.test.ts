import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  clearSubscriptions,
  initUserSubscriptions,
  resetState,
  seedSubscriptions,
  state,
} from './sharedMocks.ts'

const realSetTimeout = globalThis.setTimeout

const REQUIRED = [
  'channel.chat.message',
  'stream.offline',
  'stream.online',
  'user.update',
  'channel.prediction.begin',
  'channel.prediction.progress',
  'channel.prediction.lock',
  'channel.prediction.end',
  'channel.poll.begin',
  'channel.poll.progress',
  'channel.poll.end',
] as const

beforeEach(() => {
  resetState()
  clearSubscriptions()
})

afterEach(() => {
  globalThis.setTimeout = realSetTimeout
})

describe('initUserSubscriptions', () => {
  it('subscribes a new user to every required event type', async () => {
    const ok = await initUserSubscriptions('111')
    expect(state.subscribeCalls).toHaveLength(REQUIRED.length)
    expect(ok).toBe(true)
  })

  it('skips channel.chat.message when the bot is banned', async () => {
    state.isBanned = true
    await initUserSubscriptions('111')
    const types = state.subscribeCalls.map((c) => c.type)
    expect(types).not.toContain('channel.chat.message')
    expect(state.subscribeCalls).toHaveLength(REQUIRED.length - 1)
  })

  it('does nothing when all required subscriptions already exist', async () => {
    seedSubscriptions('111', REQUIRED)
    await initUserSubscriptions('111')
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('only subscribes the missing types for a partially-subscribed user', async () => {
    seedSubscriptions(
      '111',
      REQUIRED.filter((t) => t !== 'channel.poll.end'),
    )
    await initUserSubscriptions('111')
    expect(state.subscribeCalls.map((c) => c.type)).toEqual(['channel.poll.end'])
  })

  it('fixes both missing critical and secondary subscriptions for an existing user', async () => {
    // Existing user missing one critical (stream.online) and one secondary (channel.poll.end).
    seedSubscriptions(
      '111',
      REQUIRED.filter((t) => t !== 'stream.online' && t !== 'channel.poll.end'),
    )
    await initUserSubscriptions('111')
    const types = state.subscribeCalls.map((c) => c.type).sort()
    expect(types).toEqual(['channel.poll.end', 'stream.online'])
  })

  it('returns false when a critical subscription fails', async () => {
    state.subscribeResult = (_userId, type) => type !== 'stream.online'
    const ok = await initUserSubscriptions('111')
    expect(ok).toBe(false)
  })

  it('handles genericSubscribe throwing a non-retryable error and returns false', async () => {
    state.subscribeResult = () => {
      throw new Error('auth fail')
    }
    const ok = await initUserSubscriptions('111')
    expect(ok).toBe(false)
  })

  it('retries critical subscriptions on a rate-limit error before giving up', async () => {
    // Fire backoff timers instantly so the retry loop runs without real waits.
    globalThis.setTimeout = ((cb: () => void) => {
      cb()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    const calls: string[] = []
    state.subscribeResult = (_userId, type) => {
      calls.push(type)
      throw new Error('Rate limit hit')
    }
    const ok = await initUserSubscriptions('111')
    expect(ok).toBe(false)
    // stream.online is critical -> retried up to 3 times.
    expect(calls.filter((t) => t === 'stream.online').length).toBeGreaterThan(1)
  })
})
