import { beforeEach, describe, expect, it } from 'vitest'

import {
  disableUserCache,
  handleChatMessage,
  resetState,
  sendTwitchChatMessage,
  state,
} from './shared-mocks.ts'

interface EventOverrides {
  text?: string
  badges?: { set_id: string }[]
  chatterId?: string
  channelId?: string
  reply?: { parent_message_id: string } | undefined
  sourceMessageId?: string | null
}

const makeMessage = function makeMessage(overrides: EventOverrides = {}) {
  return {
    payload: {
      event: {
        badges: overrides.badges ?? [],
        broadcaster_user_id: overrides.channelId ?? 'chan-1',
        broadcaster_user_login: 'streamer',
        chatter_user_id: overrides.chatterId ?? 'user-1',
        chatter_user_login: 'viewer',
        message: { text: overrides.text ?? 'hello' },
        message_id: 'msg-1',
        reply: overrides.reply,
        source_message_id: overrides.sourceMessageId ?? null,
      },
      subscription: { type: 'channel.chat.message' },
    },
  }
}

describe(handleChatMessage, () => {
  beforeEach(() => {
    resetState()
  })

  it('ignores payloads without a subscription/event', async () => {
    await handleChatMessage({ payload: {} })
    expect(state.emitCalls).toHaveLength(0)
  })

  it('ignores shared-chat messages (non-null source_message_id)', async () => {
    await handleChatMessage(makeMessage({ sourceMessageId: 'other-chan' }))
    expect(state.emitCalls).toHaveLength(0)
  })

  it('emits the chat message over the socket when connected', async () => {
    await handleChatMessage(makeMessage({ text: 'hi there' }))
    expect(state.emitCalls).toHaveLength(1)
    expect(state.emitCalls[0]).toMatchObject({
      broadcasterLogin: 'streamer',
      chatterLogin: 'viewer',
      text: 'hi there',
    })
  })

  it('strips the leading @mention from a reply that contains a command', async () => {
    await handleChatMessage({
      ...makeMessage({ text: '@streamer !mmr' }),
    })
    expect(state.emitCalls[0].text).toBe('!mmr')
  })

  it('uses the reply parent message id as the message id when present', async () => {
    await handleChatMessage(makeMessage({ reply: { parent_message_id: 'parent-99' } }))
    expect(state.emitCalls[0].opts.messageId).toBe('parent-99')
  })

  it('derives mod/broadcaster/subscriber flags from badges', async () => {
    await handleChatMessage(
      makeMessage({
        badges: [{ set_id: 'moderator' }, { set_id: 'subscriber' }],
        channelId: 'chan-1',
        chatterId: 'chan-1',
      })
    )
    expect(state.emitCalls[0].opts.userInfo).toStrictEqual({
      isBroadcaster: true,
      isMod: true,
      isSubscriber: true,
      userId: 'chan-1',
    })
  })

  it('does not emit and does not message when the bot is banned (offline)', async () => {
    state.hasSocket = false
    state.isBanned = true
    await handleChatMessage(makeMessage({ text: '!ping' }))
    expect(state.emitCalls).toHaveLength(0)
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('replies to !ping over the API when offline and not banned', async () => {
    state.hasSocket = false
    state.isBanned = false
    await handleChatMessage(makeMessage({ text: '!ping' }))
    expect(state.fetchCalls).toHaveLength(1)
    expect(state.fetchCalls[0].url).toBe('https://api.twitch.tv/helix/chat/messages')
  })
})

describe(sendTwitchChatMessage, () => {
  beforeEach(() => {
    resetState()
  })

  it('drops the message when the broadcaster is being disabled', async () => {
    disableUserCache.set('user-1:b1', {
      dropReason: 'manual',
      providerAccountId: 'b1',
      timestamp: Date.now(),
    })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b1',
      message: 'disabled-case',
      sender_id: 's1',
    })
    expect(res.data[0].is_sent).toBeFalsy()
    expect(res.data[0].drop_reason?.code).toBe('user_being_disabled')
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('drops a duplicate message sent within the dedupe window', async () => {
    const params = {
      broadcaster_id: 'b-dupe',
      message: 'dupe-case',
      reply_parent_message_id: 'same-command',
      sender_id: 's1',
    }
    await sendTwitchChatMessage(params)
    const res = await sendTwitchChatMessage(params)
    expect(res.data[0].drop_reason?.code).toBe('duplicate_message')
    expect(state.fetchCalls).toHaveLength(1)
  })

  it('sends identical unthreaded messages when no source command can be identified', async () => {
    const params = { broadcaster_id: 'b-unthreaded', message: 'same text', sender_id: 's1' }

    await sendTwitchChatMessage(params)
    const res = await sendTwitchChatMessage(params)

    expect(res.data[0].is_sent).toBeTruthy()
    expect(state.fetchCalls).toHaveLength(2)
  })

  it('treats a null reply parent message id as an unthreaded message', async () => {
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-null-reply',
      message: 'null reply case',
      reply_parent_message_id: null,
      sender_id: 's1',
    })

    expect(res.data[0].is_sent).toBeTruthy()
    expect(state.fetchCalls[0].options?.body).toBe(
      '{"broadcaster_id":"b-null-reply","message":"null reply case","sender_id":"s1"}'
    )
  })

  it('sends identical replies to different chat messages', async () => {
    const base = { broadcaster_id: 'b-replies', message: 'Game was not found', sender_id: 's1' }

    await sendTwitchChatMessage({ ...base, reply_parent_message_id: 'message-1' })
    const res = await sendTwitchChatMessage({ ...base, reply_parent_message_id: 'message-2' })

    expect(res.data[0].is_sent).toBeTruthy()
    expect(state.fetchCalls).toHaveLength(2)
  })

  it('retries Twitch duplicate rejection with an invisible disambiguator', async () => {
    let attempt = 0
    state.fetchImpl = async () => {
      attempt += 1
      return await Promise.resolve({
        json: async () =>
          await Promise.resolve(
            attempt === 1
              ? {
                  data: [
                    {
                      drop_reason: { code: 'msg_duplicate', message: 'duplicate' },
                      is_sent: false,
                      message_id: '',
                    },
                  ],
                }
              : { data: [{ is_sent: true, message_id: 'retry-id' }] }
          ),
        ok: true,
      })
    }

    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-twitch-dupe',
      message: 'Same command response',
      reply_parent_message_id: 'message-1',
      sender_id: 's1',
    })

    expect(res.data[0]).toStrictEqual({ is_sent: true, message_id: 'retry-id' })
    expect(state.fetchCalls).toHaveLength(2)
    const retryBody = state.fetchCalls[1].options?.body
    expect(retryBody).toBeTypeOf('string')
    if (typeof retryBody !== 'string') {
      throw new TypeError('Expected string request body')
    }
    expect((JSON.parse(retryBody) as { message: string }).message).toBe(
      `Same command response \u034F`
    )
  })

  it('returns the API response on success', async () => {
    state.fetchImpl = async () =>
      await Promise.resolve({
        json: async () =>
          await Promise.resolve({ data: [{ is_sent: true, message_id: 'real-id' }] }),
        ok: true,
      })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-ok',
      message: 'success-case',
      sender_id: 's1',
    })
    expect(res.data[0]).toStrictEqual({ is_sent: true, message_id: 'real-id' })
  })

  it('fits oversized command replies within Twitch limits while preserving a trailing link', async () => {
    const link = ' · dota2.com/hero/invoker · Also try !hero'
    await sendTwitchChatMessage({
      broadcaster_id: 'b-long',
      message: `Invoker innate: ${'x'.repeat(600)}${link}`,
      sender_id: 's1',
    })

    const body = state.fetchCalls[0].options?.body
    expect(body).toBeTypeOf('string')
    if (typeof body !== 'string') {
      throw new TypeError('Expected string request body')
    }
    const request = JSON.parse(body) as { message: string }
    expect(request.message).toHaveLength(500)
    expect(request.message).toContain('…')
    expect(request.message.endsWith(link)).toBeTruthy()
  })

  it('flags rate limiting on a 429 response', async () => {
    state.fetchImpl = async () =>
      await Promise.resolve({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => await Promise.resolve(''),
      })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-429',
      message: 'rate-case',
      sender_id: 's1',
    })
    expect(res.data[0].drop_reason?.code).toBe('rate_limited')
  })

  it('includes the error body for a non-429 failure', async () => {
    state.fetchImpl = async () =>
      await Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => await Promise.resolve('invalid sender'),
      })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-400',
      message: 'badreq-case',
      sender_id: 's1',
    })
    expect(res.data[0].drop_reason?.code).toBe('send_error')
    expect(res.data[0].drop_reason?.message).toContain('invalid sender')
  })

  it('handles a thrown fetch error and logs it', async () => {
    state.fetchThrows = new Error('network down')
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-throw',
      message: 'throw-case',
      sender_id: 's1',
    })
    expect(res.data[0].drop_reason?.code).toBe('send_error')
    expect(res.data[0].drop_reason?.message).toBe('network down')
    expect(state.logError).toHaveLength(1)
  })
})
