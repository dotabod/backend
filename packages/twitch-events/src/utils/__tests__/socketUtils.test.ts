// Regression coverage for the `.catch` guards added to socketUtils.ts'
// `enable` / `resubscribe` handlers. handleNewUser rejects on critical-sub
// failures; without the .catch those rejections become unhandledRejection
// and Node 24 crashes the single-replica twitch-events service.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logCalls: { info: any[]; error: any[]; warn: any[] } = { error: [], info: [], warn: [] }
let handleNewUserBehavior: (id: string, resub: boolean) => Promise<void> = async () => {}

vi.doMock(import('@dotabod/shared-utils'), () => ({
  botStatus: { isBanned: false },
  fetchConduitId: async () => 'conduit-1',
  logger: {
    debug: () => {},
    error: (message: string, meta?: Record<string, unknown>) =>
      logCalls.error.push({ message, meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      logCalls.info.push({ message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logCalls.warn.push({ message, meta }),
  },
  supabase: { from: () => ({}) },
}))

// Replace the heavy handleNewUser implementation with a test double whose
// behavior the test owns turn-by-turn.
vi.doMock(import('../../handleNewUser'), () => ({
  handleNewUser: async (id: string, resub: boolean) => await handleNewUserBehavior(id, resub),
}))

vi.doMock(import('../../twitch/lib/revokeEvent'), () => ({
  revokeEvent: async () => {},
}))

// socket.io's Server constructor binds a port at module load. Replace it
// with a no-op so importing socketUtils doesn't try to listen on 5015 in
// the test process.
vi.doMock(import('socket.io'), () => ({
  Server: class FakeServer {
    on() {}
  },
}))

// Module-load triggers `new Server(5015)` (mocked above) — must happen AFTER
// the doMock calls so the mock is active.
const { onSocketEnable, onSocketResubscribe } = await import('../socketUtils')

beforeEach(() => {
  logCalls.info = []
  logCalls.error = []
  logCalls.warn = []
  handleNewUserBehavior = async () => {}
})

afterEach(() => {
  vi.useRealTimers()
})

describe('onSocketEnable', () => {
  it('does not throw when handleNewUser rejects (the .catch absorbs it)', async () => {
    handleNewUserBehavior = async () => {
      throw new Error('critical subscription failed')
    }
    // Must not throw synchronously OR cause an unhandled rejection.
    onSocketEnable('tw-1')
    // Drain microtasks so the .catch logger runs.
    await new Promise<void>((r) => setTimeout(r, 0))

    expect(
      logCalls.error.some((c) => c.message === '[TWITCHEVENTS] socket enable handleNewUser failed')
    ).toBeTruthy()
    expect(logCalls.error[0].meta).toMatchObject({
      error: 'critical subscription failed',
      providerAccountId: 'tw-1',
    })
  })

  it('logs info on success and does not log error', async () => {
    onSocketEnable('tw-ok')
    await new Promise<void>((r) => setTimeout(r, 0))

    expect(logCalls.info.some((c) => c.message.includes('Enabling events for user'))).toBeTruthy()
    expect(logCalls.error).toHaveLength(0)
  })
})

describe('onSocketResubscribe', () => {
  it('does not throw when handleNewUser rejects (the .catch absorbs it)', async () => {
    handleNewUserBehavior = async () => {
      throw new Error('rate limited')
    }
    onSocketResubscribe('tw-2')
    await new Promise<void>((r) => setTimeout(r, 0))

    expect(
      logCalls.error.some(
        (c) => c.message === '[TWITCHEVENTS] socket resubscribe handleNewUser failed'
      )
    ).toBeTruthy()
  })
})
