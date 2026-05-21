import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  clearSubscriptions,
  ensureBotIsModerator,
  handleNewUser,
  resetState,
  state,
} from './sharedMocks.ts'

const botEnv = { bot: process.env.TWITCH_BOT_PROVIDERID, client: process.env.TWITCH_CLIENT_ID }

beforeEach(() => {
  resetState()
  clearSubscriptions()
})

describe('handleNewUser', () => {
  it('returns early without a providerAccountId', async () => {
    await handleNewUser('')
    expect(state.updates).toHaveLength(0)
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('updates the user profile from Twitch and resubscribes events', async () => {
    state.stream = { startDate: new Date('2026-05-20T00:00:00.000Z') }
    state.streamer = { displayName: 'Cool', name: 'cool' }
    state.dbUser = { userId: 'user-1' }

    await handleNewUser('111')

    expect(state.updates.some((u) => u.table === 'users' && u.values.name === 'cool')).toBe(true)
    // resubscribeEvents defaults true -> initUserSubscriptions ran.
    expect(state.subscribeCalls.length).toBeGreaterThan(0)
  })

  it('skips the profile update when the account is not found', async () => {
    state.dbUser = null
    await handleNewUser('111', false)
    expect(state.updates).toHaveLength(0)
  })
})

describe('ensureBotIsModerator', () => {
  beforeEach(() => {
    process.env.TWITCH_BOT_PROVIDERID = 'bot-1'
    process.env.TWITCH_CLIENT_ID = 'client-1'
  })
  afterEach(() => {
    process.env.TWITCH_BOT_PROVIDERID = botEnv.bot
    process.env.TWITCH_CLIENT_ID = botEnv.client
  })

  it('adds the bot as a moderator', async () => {
    await ensureBotIsModerator('999')
    expect(state.addModeratorCalls).toContain('999')
  })

  it('swallows the "already a mod" error', async () => {
    state.addModeratorError = { _body: 'user is already a mod' }
    await ensureBotIsModerator('999')
    expect(state.logError).toHaveLength(0)
  })

  it('warns and returns when bot/client env is missing', async () => {
    delete process.env.TWITCH_BOT_PROVIDERID
    await ensureBotIsModerator('999')
    expect(state.addModeratorCalls).toHaveLength(0)
  })
})
