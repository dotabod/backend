import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearSubscriptions,
  initUserSubscriptions,
  resetState,
  seedSubscriptions,
  state,
} from './shared-mocks.ts'

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

describe(initUserSubscriptions, () => {
  beforeEach(() => {
    resetState()
    clearSubscriptions()
  })

  it('subscribes a new user to every required event type', async () => {
    const ok = await initUserSubscriptions('111')
    expect(state.subscribeCalls).toHaveLength(REQUIRED.length)
    expect(ok).toBeTruthy()
  })

  it('skips channel.chat.message when the bot is banned', async () => {
    state.isBanned = true
    await initUserSubscriptions('111')
    const types = state.subscribeCalls.map((c) => c.type)
    expect(types).not.toContain('channel.chat.message')
    expect(state.subscribeCalls).toHaveLength(REQUIRED.length - 1)
  })

  it('skips channel.chat.message and records BOT_BANNED when the bot is banned in the channel', async () => {
    const savedBotId = process.env.TWITCH_BOT_PROVIDERID
    const savedClientId = process.env.TWITCH_CLIENT_ID
    process.env.TWITCH_BOT_PROVIDERID = 'bot-1'
    process.env.TWITCH_CLIENT_ID = 'client-1'
    try {
      state.addModeratorError = {
        _body: '{"error":"Bad Request","status":400,"message":"user is banned"}',
      }
      const ok = await initUserSubscriptions('193001897')
      const types = state.subscribeCalls.map((call) => call.type)
      expect(ok).toBeTruthy()
      expect(types).not.toContain('channel.chat.message')
      expect(state.subscribeCalls).toHaveLength(REQUIRED.length - 1)
      expect(state.commandDisableCalls).toContainEqual(
        expect.objectContaining({
          kind: 'disable',
          reason: 'BOT_BANNED',
          userId: 'user-1',
        })
      )
    } finally {
      process.env.TWITCH_BOT_PROVIDERID = savedBotId
      process.env.TWITCH_CLIENT_ID = savedClientId
    }
  })

  it('skips channel.chat.message on resync when non-chat subscriptions already exist and the bot is banned in the channel', async () => {
    const savedBotId = process.env.TWITCH_BOT_PROVIDERID
    const savedClientId = process.env.TWITCH_CLIENT_ID
    process.env.TWITCH_BOT_PROVIDERID = 'bot-1'
    process.env.TWITCH_CLIENT_ID = 'client-1'
    try {
      seedSubscriptions(
        '193001897',
        REQUIRED.filter((type) => type !== 'channel.chat.message')
      )
      state.addModeratorError = {
        _body: '{"error":"Bad Request","status":400,"message":"user is banned"}',
      }
      const ok = await initUserSubscriptions('193001897')
      expect({
        disableReasons: state.commandDisableCalls.map((call) =>
          call.kind === 'disable' ? `${call.userId}:${call.reason}` : call.kind
        ),
        ok,
        subscribeCalls: state.subscribeCalls,
      }).toStrictEqual({
        disableReasons: ['user-1:BOT_BANNED'],
        ok: true,
        subscribeCalls: [],
      })

      // Subsequent resync once already marked BOT_BANNED skips chat sub without duplicate disable writes.
      state.commandDisableCalls = []
      state.dbSettings = [{ disable_reason: 'BOT_BANNED', key: 'commandDisable', value: true }]
      const okAgain = await initUserSubscriptions('193001897')
      expect({
        commandDisableCalls: state.commandDisableCalls,
        okAgain,
        subscribeCalls: state.subscribeCalls,
      }).toStrictEqual({
        commandDisableCalls: [],
        okAgain: true,
        subscribeCalls: [],
      })
    } finally {
      process.env.TWITCH_BOT_PROVIDERID = savedBotId
      process.env.TWITCH_CLIENT_ID = savedClientId
    }
  })

  it('does nothing when all required subscriptions already exist', async () => {
    seedSubscriptions('111', REQUIRED)
    await initUserSubscriptions('111')
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('only subscribes the missing types for a partially-subscribed user', async () => {
    seedSubscriptions(
      '111',
      REQUIRED.filter((t) => t !== 'channel.poll.end')
    )
    await initUserSubscriptions('111')
    expect(state.subscribeCalls.map((c) => c.type)).toStrictEqual(['channel.poll.end'])
  })

  it('fixes both missing critical and secondary subscriptions for an existing user', async () => {
    // Existing user missing one critical (stream.online) and one secondary (channel.poll.end).
    seedSubscriptions(
      '111',
      REQUIRED.filter((t) => t !== 'stream.online' && t !== 'channel.poll.end')
    )
    await initUserSubscriptions('111')
    const types = state.subscribeCalls.map((call) => call.type)
    expect(types).toStrictEqual(['stream.online', 'channel.poll.end'])
  })

  it('returns false when a critical subscription fails', async () => {
    state.subscribeResult = (_userId, type) => type !== 'stream.online'
    const ok = await initUserSubscriptions('111')
    expect(ok).toBeFalsy()
  })

  it('handles genericSubscribe throwing a non-retryable error and returns false', async () => {
    state.subscribeResult = () => {
      throw new Error('auth fail')
    }
    const ok = await initUserSubscriptions('111')
    expect(ok).toBeFalsy()
  })

  it('retries critical subscriptions on a rate-limit error before giving up', async () => {
    const calls: string[] = []
    const waitCalls: number[] = []
    state.subscribeResult = (_userId, type) => {
      calls.push(type)
      if (type === 'stream.online') {
        throw new Error('Rate limit hit')
      }
      return true
    }
    const ok = await initUserSubscriptions('111', {
      waitForRetry: async (milliseconds: number) => {
        await Promise.resolve()
        waitCalls.push(milliseconds)
      },
    })

    expect({
      ok,
      streamOnlineAttempts: calls.filter((type) => type === 'stream.online').length,
      waitCalls,
    }).toStrictEqual({
      ok: false,
      streamOnlineAttempts: 3,
      waitCalls: [1000, 2000],
    })
  })
})
