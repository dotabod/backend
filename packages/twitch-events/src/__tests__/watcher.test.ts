import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  clearSubscriptions,
  eventSubMap,
  fetchState,
  resetState,
  seedSubscriptions,
  setupAccountWatcher,
  state,
} from './sharedMocks.ts'

// Fire a recorded postgres_changes handler by event+table key.
async function fire(
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  table: 'accounts' | 'users',
  payload: { new?: Record<string, unknown>; old?: Record<string, unknown> },
) {
  const handler = state.channelHandlers.get(`${event}:${table}`)
  if (!handler) throw new Error(`no handler registered for ${event}:${table}`)
  await handler(payload)
}

beforeEach(() => {
  resetState()
  clearSubscriptions()
  fetchState.calls = []
  fetchState.queue = []
  setupAccountWatcher()
})

describe('setupAccountWatcher', () => {
  it("UPDATE:users banned_at null→set → stops the user's Twitch subscriptions", async () => {
    // Seed an active EventSub registration for this user so we can verify
    // the teardown actually ran (the no-subs path early-returns inside
    // stopUserSubscriptions and would yield a false-pass).
    seedSubscriptions('tw-banned', ['stream.online', 'channel.chat.message'])
    state.accountsLookupResults = [
      { data: { providerAccountId: 'tw-banned' }, error: null }, // watcher's ban-branch lookup
    ]

    await fire('UPDATE', 'users', {
      new: { id: 'u-banned', banned_at: '2026-05-24T00:00:00.000Z' },
      old: { id: 'u-banned', banned_at: null },
    })

    // Each seeded sub triggers a Twitch DELETE call.
    const deleteCalls = fetchState.calls.filter((c) => c.includes('eventsub/subscriptions?id='))
    expect(deleteCalls).toHaveLength(2)
    expect(eventSubMap['tw-banned']).toBeUndefined()
    // Rename path must NOT also run for this payload (no double-handling).
    expect(state.subscribeCalls).toHaveLength(0)
    expect(state.updates.some((u) => u.table === 'users')).toBe(false)
  })

  it('UPDATE:users with banned_at unchanged → no teardown', async () => {
    seedSubscriptions('tw-still', ['stream.online'])
    await fire('UPDATE', 'users', {
      new: { id: 'u-still', name: 'same', displayName: 'Same', banned_at: null },
      old: { id: 'u-still', name: 'same', displayName: 'Same', banned_at: null },
    })
    // Sub map left intact.
    expect(eventSubMap['tw-still']).toBeDefined()
  })

  it('registers four Realtime listeners and a subscribe callback', () => {
    expect(state.channelHandlers.size).toBe(4)
    expect(state.channelHandlers.has('INSERT:accounts')).toBe(true)
    expect(state.channelHandlers.has('UPDATE:accounts')).toBe(true)
    expect(state.channelHandlers.has('DELETE:accounts')).toBe(true)
    expect(state.channelHandlers.has('UPDATE:users')).toBe(true)
    expect(state.channelSubscribeStatuses).toContain('SUBSCRIBED')
  })

  it('INSERT:accounts (twitch provider) → onboards new user', async () => {
    state.streamer = { displayName: 'Newbie', name: 'newbie' }
    state.dbUser = { userId: 'user-new' }

    await fire('INSERT', 'accounts', {
      new: { provider: 'twitch', providerAccountId: 'tw-new' },
    })

    expect(state.subscribeCalls.some((c) => c.userId === 'tw-new')).toBe(true)
    expect(state.updates.some((u) => u.table === 'users' && u.values.name === 'newbie')).toBe(true)
  })

  it('INSERT:accounts (non-twitch provider) → ignored', async () => {
    await fire('INSERT', 'accounts', {
      new: { provider: 'discord', providerAccountId: 'd-1' },
    })
    expect(state.subscribeCalls).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('UPDATE:accounts requires_refresh true→false → re-onboards', async () => {
    state.streamer = { displayName: 'Returning', name: 'returning' }
    state.dbUser = { userId: 'user-back' }

    await fire('UPDATE', 'accounts', {
      new: { provider: 'twitch', providerAccountId: 'tw-back', requires_refresh: false },
      old: { provider: 'twitch', providerAccountId: 'tw-back', requires_refresh: true },
    })

    expect(state.subscribeCalls.some((c) => c.userId === 'tw-back')).toBe(true)
  })

  it('UPDATE:accounts that does NOT flip requires_refresh → no-op', async () => {
    await fire('UPDATE', 'accounts', {
      new: { provider: 'twitch', providerAccountId: 'tw-x', requires_refresh: false },
      old: { provider: 'twitch', providerAccountId: 'tw-x', requires_refresh: false },
    })
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('DELETE:accounts (twitch provider) → deletes Twitch subs and clears eventSubMap', async () => {
    // Previous version of this test only asserted "no error log" — and since
    // beforeEach clears eventSubMap, stopUserSubscriptions early-returned at
    // its `if (!subscriptions) return` guard. The deletion loop was never
    // exercised. Seed the map first so we actually verify the path.
    seedSubscriptions('tw-gone', ['stream.online', 'stream.offline'])
    expect(eventSubMap['tw-gone']).toBeDefined()

    await fire('DELETE', 'accounts', {
      old: { provider: 'twitch', providerAccountId: 'tw-gone' },
    })

    // Each subscription should have triggered a Twitch DELETE call.
    const deleteCalls = fetchState.calls.filter((c) => c.includes('eventsub/subscriptions?id='))
    expect(deleteCalls).toHaveLength(2)
    // And the user's entry should be removed from the in-memory map.
    expect(eventSubMap['tw-gone']).toBeUndefined()
    expect(state.logError.some((l) => l.message.includes('DELETE stopUserSubscriptions'))).toBe(
      false,
    )
  })

  it('UPDATE:accounts (non-twitch provider) → ignored even on requires_refresh flip', async () => {
    // INSERT and DELETE filter on provider === 'twitch'; UPDATE used to skip
    // that filter, which meant a discord/kick row flipping requires_refresh
    // would invoke handleNewUser with a non-twitch provider id and spam the
    // Twitch API with bogus lookups.
    await fire('UPDATE', 'accounts', {
      new: { provider: 'discord', providerAccountId: 'd-1', requires_refresh: false },
      old: { provider: 'discord', providerAccountId: 'd-1', requires_refresh: true },
    })
    expect(state.subscribeCalls).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('UPDATE:users with a DB error during lookup → logs at error level (not silent warn)', async () => {
    state.accountsLookupResults = [{ data: null, error: new Error('postgrest connection reset') }]
    await fire('UPDATE', 'users', {
      new: { id: 'u-1', name: 'new', displayName: 'New' },
      old: { id: 'u-1', name: 'old', displayName: 'Old' },
    })
    // A transient DB error must surface at error level so observability picks
    // it up — not be silently swallowed as "no twitch account row found".
    expect(
      state.logError.some((l) => l.message.includes('DB error during user rename lookup')),
    ).toBe(true)
    // And handleNewUser should NOT be called (we don't know the providerAccountId).
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('DELETE:accounts (non-twitch provider) → ignored', async () => {
    await fire('DELETE', 'accounts', {
      old: { provider: 'discord', providerAccountId: 'd-gone' },
    })
    // No paths fired.
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('UPDATE:users with no name/displayName change → no-op', async () => {
    await fire('UPDATE', 'users', {
      new: { id: 'u-1', name: 'same', displayName: 'Same' },
      old: { id: 'u-1', name: 'same', displayName: 'Same' },
    })
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('UPDATE:users handles a Twitch rename (techleed → jamesleed) via Helix reconcile', async () => {
    // Rename flow:
    //   1. Frontend's jwt() callback detects preferred_username changed and
    //      writes users.displayName = 'JAMESLEED' (login is still stale).
    //   2. That UPDATE arrives here: old.{name='techleed', displayName='TECHLEED'},
    //      new.{name='techleed', displayName='JAMESLEED'}.
    //   3. Handler calls handleNewUser(providerAccountId, false), which hits
    //      /helix/users via the mocked botApi and writes back the canonical
    //      lowercase login + display_name. The next UPDATE:users (from THIS
    //      write) will have matching old/new and short-circuit at the guard.
    state.streamer = { displayName: 'JAMESLEED', name: 'jamesleed' }
    state.accountsLookupResults = [
      { data: { providerAccountId: 'tw-rename' }, error: null }, // watcher's lookup
      { data: { userId: 'u-rename' }, error: null }, // handleNewUser's findUserIdByProviderAccount
    ]
    await fire('UPDATE', 'users', {
      new: { id: 'u-rename', name: 'techleed', displayName: 'JAMESLEED' },
      old: { id: 'u-rename', name: 'techleed', displayName: 'TECHLEED' },
    })
    // handleNewUser ran and wrote the Helix-canonical name + displayName.
    const userUpdate = state.updates.find((u) => u.table === 'users')
    expect(userUpdate?.values.name).toBe('jamesleed')
    expect(userUpdate?.values.displayName).toBe('JAMESLEED')
    // EventSub subs are keyed by Twitch user-id (stable across renames) — no
    // re-registration needed on a rename, even though displayName changed.
    expect(state.subscribeCalls).toHaveLength(0)
  })

  it('UPDATE:users does NOT resubscribe when old displayName was empty (rename-only handler)', async () => {
    // Pre-cleanup: the handler treated `!oldUser.displayName` as a "brand-new
    // user" signal and forced a full EventSub re-registration via
    // handleNewUser(..., true). That signal only existed to compensate for
    // the frontend writing `displayName=NULL` on initial signup, which is
    // now fixed (TwitchProvider.profile() override hits /helix/users so
    // displayName is set from row creation). Initial subscription is the
    // INSERT:accounts handler's job; this handler only refreshes the
    // displayName/name fields via the Twitch API call inside handleNewUser.
    state.streamer = { displayName: 'New', name: 'newlogin' }
    // First lookup: watcher selects providerAccountId. Second lookup:
    // handleNewUser → findUserIdByProviderAccount selects userId.
    state.accountsLookupResults = [
      { data: { providerAccountId: 'tw-u1' }, error: null },
      { data: { userId: 'u-1' }, error: null },
    ]
    await fire('UPDATE', 'users', {
      new: { id: 'u-1', name: 'newlogin', displayName: 'New' },
      old: { id: 'u-1', name: 'newlogin', displayName: null },
    })
    // Profile update DID run (handleNewUser was called with resubscribe=false).
    expect(state.updates.some((u) => u.table === 'users')).toBe(true)
    // But initUserSubscriptions was NOT called.
    expect(state.subscribeCalls).toHaveLength(0)
  })

  describe('Realtime channel reconnect', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('re-subscribes after a CHANNEL_ERROR status', async () => {
      vi.useFakeTimers()
      // setupAccountWatcher in beforeEach already created the initial channel.
      expect(state.channelCreationCount).toBe(1)
      expect(state.channelSubscribeCallbacks).toHaveLength(1)

      // Simulate the WebSocket dropping.
      state.channelSubscribeCallbacks[0]('CHANNEL_ERROR', new Error('connection lost'))

      // Watcher tears down the dead channel immediately.
      expect(state.removeChannelCount).toBe(1)
      // ...but does NOT recreate it synchronously (waits for the backoff).
      expect(state.channelCreationCount).toBe(1)

      // After the backoff delay, the watcher creates a fresh channel and
      // re-attaches all four handlers.
      await vi.advanceTimersByTimeAsync(5100)
      expect(state.channelCreationCount).toBe(2)
      expect(state.channelHandlers.size).toBe(4)
    })

    it('also reconnects on CLOSED and TIMED_OUT statuses', async () => {
      vi.useFakeTimers()
      state.channelSubscribeCallbacks[0]('CLOSED')
      await vi.advanceTimersByTimeAsync(5100)
      expect(state.channelCreationCount).toBe(2)

      state.channelSubscribeCallbacks[1]('TIMED_OUT')
      await vi.advanceTimersByTimeAsync(5100)
      expect(state.channelCreationCount).toBe(3)
    })

    it('does not pile up reconnect timers if CHANNEL_ERROR fires repeatedly before the backoff elapses', async () => {
      vi.useFakeTimers()
      state.channelSubscribeCallbacks[0]('CHANNEL_ERROR')
      state.channelSubscribeCallbacks[0]('CHANNEL_ERROR')
      state.channelSubscribeCallbacks[0]('CHANNEL_ERROR')
      // First call tears down; subsequent on the dead callback must be ignored.
      expect(state.removeChannelCount).toBe(1)
      await vi.advanceTimersByTimeAsync(5100)
      // Only ONE reconnect, not three.
      expect(state.channelCreationCount).toBe(2)
    })

    it('SUBSCRIBED status is logged and does not trigger any reconnect', () => {
      // The initial SUBSCRIBED already fired in beforeEach (synchronous mock).
      expect(state.channelSubscribeStatuses).toContain('SUBSCRIBED')
      expect(state.removeChannelCount).toBe(0)
      expect(state.channelCreationCount).toBe(1)
    })

    it('schedules a reconnect when supabase.channel() throws synchronously', async () => {
      // Force the next channel() to throw — simulates a Realtime client in
      // a bad state. Before the guard, this would take down the watcher
      // silently (no listener attached, no reconnect scheduled).
      vi.useFakeTimers()
      resetState()
      state.channelCreationError = new Error('realtime client not ready')
      setupAccountWatcher()

      // The status callback never attached (channel() threw), but the catch
      // path logged an error and scheduled a reconnect.
      expect(state.logError.some((l) => l.message.includes('supabase.channel() threw'))).toBe(true)

      // Clear the error so the next channel() call succeeds.
      state.channelCreationError = null
      await vi.advanceTimersByTimeAsync(5100)

      // Reconnect ran: a fresh channel was created and handlers attached.
      expect(state.channelCreationCount).toBeGreaterThanOrEqual(2)
      expect(state.channelHandlers.size).toBe(4)
    })

    it('schedules a reconnect when channel.on() throws synchronously', async () => {
      // Force the first .on(...) call to throw — simulates a bad option shape
      // or a state.channel mutation. Without the chain-level try/catch the
      // .subscribe() at the end never attaches and reconnect cannot fire.
      vi.useFakeTimers()
      resetState()
      state.channelOnError = new Error('invalid event filter')
      setupAccountWatcher()

      expect(state.logError.some((l) => l.message.includes('channel.on/.subscribe threw'))).toBe(
        true,
      )

      // Clear the error and let the reconnect tick.
      state.channelOnError = null
      await vi.advanceTimersByTimeAsync(5100)

      // The reconnect created a fresh channel and attached all 4 handlers.
      expect(state.channelHandlers.size).toBe(4)
    })
  })

  it('handler logs at error level when handleNewUser throws (so reconciliation cycle sees it)', async () => {
    // Force initUserSubscriptions to return false → handleNewUser throws.
    state.streamer = { displayName: 'Broken', name: 'broken' }
    state.dbUser = { userId: 'user-broken' }
    state.subscribeResult = (_userId, type) => type !== 'stream.online'

    await fire('INSERT', 'accounts', {
      new: { provider: 'twitch', providerAccountId: 'tw-broken' },
    })

    expect(state.logError.some((l) => l.message === '[WATCHER] INSERT handleNewUser failed')).toBe(
      true,
    )
  })
})
