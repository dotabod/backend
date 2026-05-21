import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { commandHandler, makeMessage, resetState, state } from './setupMocks.ts'

// Covers the simple, formatting-only commands (no GSI/DB coupling) dispatched
// via commandHandler.handleMessage(). Companion to commands.integration.test.ts.

beforeEach(() => {
  resetState()
  commandHandler.cooldowns.clear()
})

describe('!dotabod', () => {
  it('chats the dotabod info message', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!dotabod' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com')
    expect(state.chatSayCalls[0].message).toContain('@techleed')
  })
})

describe('!commands', () => {
  it('chats a link to the channel commands page', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!commands' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/streamer')
  })
})

describe('!version', () => {
  const original = process.env.COMMIT_HASH

  afterEach(() => {
    if (original === undefined) delete process.env.COMMIT_HASH
    else process.env.COMMIT_HASH = original
  })

  it('reports the unknown-version message when COMMIT_HASH is unset', async () => {
    delete process.env.COMMIT_HASH
    await commandHandler.handleMessage(makeMessage({ content: '!version' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('github.com/dotabod/backend')
  })

  it('reports the commit hash and compare URL when COMMIT_HASH is set', async () => {
    process.env.COMMIT_HASH = 'abc1234'
    await commandHandler.handleMessage(makeMessage({ content: '!version' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('abc1234')
  })
})

describe('!steam', () => {
  it('chats the steamid.xyz link when a steam32Id is known', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!steam' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toBe('steamid.xyz/99999')
  })

  it('reports unknownSteam when no steam32Id and not multiAccount', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!steam', clientOverrides: { steam32Id: null } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('steam')
  })

  it('reports the multiAccount message when no steam32Id and multiAccount is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!steam',
        clientOverrides: { steam32Id: null, multiAccount: true } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('dotabod.com/dashboard/features')
  })
})

describe('!match', () => {
  it('reports gameNotFound when there is no live match', async () => {
    await commandHandler.handleMessage(makeMessage({ content: '!match' }))
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toContain('game')
  })

  it('chats the match id when GSI has one', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!match',
        clientOverrides: { gsi: { map: { matchid: '7777777777' } } } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('7777777777')
  })

  it('blocks when the stream is offline (onlyOnline gate)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!match', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })
})

describe('!song', () => {
  it('reports lastFmNotConfigured when the command is enabled but no username is set', async () => {
    await commandHandler.handleMessage(
      makeMessage({
        content: '!song',
        clientOverrides: { settings: [{ key: 'commandLastFm', value: true }] } as any,
      }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message.toLowerCase()).toMatch(/last|fm|configure/)
  })

  it('blocks when the stream is offline (onlyOnline gate)', async () => {
    await commandHandler.handleMessage(
      makeMessage({ content: '!song', clientOverrides: { stream_online: false } }),
    )
    expect(state.chatSayCalls).toHaveLength(1)
    expect(state.chatSayCalls[0].message).toContain('PauseChamp')
  })
})
