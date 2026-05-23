import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  disableUserCache,
  handleChatMessage,
  resetState,
  sendTwitchChatMessage,
  state,
} from './sharedMocks.ts'

type EventOverrides = {
  text?: string
  badges?: { set_id: string }[]
  chatterId?: string
  channelId?: string
  reply?: { parent_message_id: string } | undefined
  sourceMessageId?: string | null
}

function makeMessage(overrides: EventOverrides = {}) {
  return {
    payload: {
      subscription: { type: 'channel.chat.message' },
      event: {
        chatter_user_login: 'viewer',
        chatter_user_id: overrides.chatterId ?? 'user-1',
        message: { text: overrides.text ?? 'hello' },
        message_id: 'msg-1',
        broadcaster_user_id: overrides.channelId ?? 'chan-1',
        broadcaster_user_login: 'streamer',
        badges: overrides.badges ?? [],
        reply: overrides.reply,
        source_message_id: overrides.sourceMessageId ?? null,
      },
    },
  }
}

describe('handleChatMessage', () => {
  beforeEach(() => resetState())

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
        chatterId: 'chan-1',
        channelId: 'chan-1',
        badges: [{ set_id: 'moderator' }, { set_id: 'subscriber' }],
      }),
    )
    expect(state.emitCalls[0].opts.userInfo).toEqual({
      isMod: true,
      isBroadcaster: true,
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

describe('sendTwitchChatMessage', () => {
  beforeEach(() => resetState())

  it('drops the message when the broadcaster is being disabled', async () => {
    disableUserCache.set('user-1:b1', {
      timestamp: Date.now(),
      dropReason: 'manual',
      providerAccountId: 'b1',
    })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b1',
      sender_id: 's1',
      message: 'disabled-case',
    })
    expect(res.data[0].is_sent).toBe(false)
    expect(res.data[0].drop_reason?.code).toBe('user_being_disabled')
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('drops a duplicate message sent within the dedupe window', async () => {
    const params = { broadcaster_id: 'b-dupe', sender_id: 's1', message: 'dupe-case' }
    await sendTwitchChatMessage(params)
    const res = await sendTwitchChatMessage(params)
    expect(res.data[0].drop_reason?.code).toBe('duplicate_message')
    expect(state.fetchCalls).toHaveLength(1)
  })

  it('returns the API response on success', async () => {
    state.fetchImpl = async () => ({
      ok: true,
      json: async () => ({ data: [{ message_id: 'real-id', is_sent: true }] }),
    })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-ok',
      sender_id: 's1',
      message: 'success-case',
    })
    expect(res.data[0]).toEqual({ message_id: 'real-id', is_sent: true })
  })

  it('flags rate limiting on a 429 response', async () => {
    state.fetchImpl = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => '',
    })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-429',
      sender_id: 's1',
      message: 'rate-case',
    })
    expect(res.data[0].drop_reason?.code).toBe('rate_limited')
  })

  it('includes the error body for a non-429 failure', async () => {
    state.fetchImpl = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid sender',
    })
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-400',
      sender_id: 's1',
      message: 'badreq-case',
    })
    expect(res.data[0].drop_reason?.code).toBe('send_error')
    expect(res.data[0].drop_reason?.message).toContain('invalid sender')
  })

  it('handles a thrown fetch error and logs it', async () => {
    state.fetchThrows = new Error('network down')
    const res = await sendTwitchChatMessage({
      broadcaster_id: 'b-throw',
      sender_id: 's1',
      message: 'throw-case',
    })
    expect(res.data[0].drop_reason?.code).toBe('send_error')
    expect(res.data[0].drop_reason?.message).toBe('network down')
    expect(state.logError).toHaveLength(1)
  })
})
