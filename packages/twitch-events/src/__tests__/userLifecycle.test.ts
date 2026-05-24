import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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

  it('skips the profile update when the account is not found (after replica-lag retry)', async () => {
    // The lookup retries once with a 1s wait to mitigate Realtime/replica
    // races. Use fake timers so the test isn't slowed by the real delay.
    vi.useFakeTimers()
    state.dbUser = null
    const work = handleNewUser('111', false)
    // Drive the retry timer to completion.
    await vi.advanceTimersByTimeAsync(1100)
    await work
    vi.useRealTimers()
    expect(state.updates).toHaveLength(0)
    expect(
      state.logWarn.some(
        (l) => l.message === '[TWITCHEVENTS] handleNewUser: no accounts row for providerAccountId',
      ),
    ).toBe(true)
  })

  it('throws when initUserSubscriptions returns false (critical subscription failed)', async () => {
    state.dbUser = { userId: 'user-1' }
    state.streamer = { displayName: 'Streamer', name: 'streamer' }
    // Force a critical type to fail so initUserSubscriptions returns false.
    state.subscribeResult = (_userId, type) => (type === 'stream.online' ? false : true)

    await expect(handleNewUser('222')).rejects.toThrow(
      /initUserSubscriptions: critical subscription failed/,
    )
  })

  it('recovers when the accounts row appears on the second lookup (replica lag)', async () => {
    vi.useFakeTimers()
    state.streamer = { displayName: 'L8', name: 'l8' }
    // Script per-call lookup behavior: first call returns null (row not yet
    // visible), second call returns the row (replica caught up). The mocked
    // mutation-after-call approach used previously did NOT exercise the retry
    // — state.dbUser was set synchronously before the first await drained, so
    // attempt 0 already saw the row.
    state.accountsLookupResults = [
      { data: null, error: null },
      { data: { userId: 'user-3' }, error: null },
    ]
    const work = handleNewUser('333', false)
    await vi.advanceTimersByTimeAsync(1100)
    await work
    vi.useRealTimers()

    expect(state.updates.some((u) => u.table === 'users' && u.values.name === 'l8')).toBe(true)
    // Both queued results were consumed → the retry path actually ran.
    expect(state.accountsLookupResults).toHaveLength(0)
  })

  it('logs at error level (not as silent missing-row) on a transient DB error', async () => {
    // Both attempts return a postgrest error. The wrapper used to drop the
    // error field and treat this identically to "row not found", logging the
    // misleading warn "no accounts row for providerAccountId". The fix bubbles
    // the error up so the outer catch logs at error level with the actual
    // error attached — observability now sees the real cause.
    vi.useFakeTimers()
    state.accountsLookupResults = [
      { data: null, error: new Error('connection reset by peer') },
      { data: null, error: new Error('connection reset by peer') },
    ]
    const work = handleNewUser('111', false)
    await vi.advanceTimersByTimeAsync(1100)
    await work
    vi.useRealTimers()

    // The misleading warn must NOT fire — the row isn't missing, the lookup
    // errored.
    expect(
      state.logWarn.some((l) => l.message.includes('no accounts row for providerAccountId')),
    ).toBe(false)
    // Instead, the error path is logged with the real cause.
    expect(
      state.logError.some(
        (l) =>
          l.message.includes('profile update failed') &&
          String((l.meta?.error as Error | undefined)?.message).includes('connection reset'),
      ),
    ).toBe(true)
    // And the users row was NOT updated (we never got a userId).
    expect(state.updates).toHaveLength(0)
  })

  it('still attempts subscriptions when the Twitch profile-fetch step fails', async () => {
    // Old: throw-in-catch from the Twitch API try block skipped the
    // resubscribe step entirely. New: profile-fetch failures are logged and
    // we continue into subscription registration so the user is at least
    // subscribed to events even during a transient Twitch /helix/streams
    // outage.
    state.dbUser = { userId: 'user-1' }
    state.streamError = new Error('Twitch /helix/streams 503')
    state.streamer = { displayName: 'X', name: 'x' }

    await handleNewUser('444', true)

    // Profile update never ran (Twitch fetch threw before reaching it).
    expect(state.updates.some((u) => u.table === 'users')).toBe(false)
    // But subscription registration DID run.
    expect(state.subscribeCalls.some((c) => c.userId === '444')).toBe(true)
    // And the failure was surfaced at error level for observability.
    expect(
      state.logError.some((l) => l.message.includes('handleNewUser: profile update failed')),
    ).toBe(true)
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
