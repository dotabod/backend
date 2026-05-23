import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  type ClipScheduleDeps,
  type ClipTaskPayload,
  rearmWith,
  scheduleClipWith,
} from '../clipSchedule.ts'

// Fully in-memory deps so the scheduling/re-arm logic is exercised offline with
// no Twitch, Redis, real timers, or process-wide module mocks (which would leak
// into sibling test files and break randomized ordering).
type Captured = { delayMs: number; cb: () => void | Promise<void> }

function makeDeps() {
  const zset = new Map<string, number>()
  const armed: Captured[] = []
  let runCalls = 0
  let now = 1_000_000

  const deps: ClipScheduleDeps = {
    zAdd: async (member, score) => {
      zset.set(member, score)
      return 1
    },
    zRem: async (member) => (zset.delete(member) ? 1 : 0),
    zRangeAll: async () => [...zset.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m),
    arm: (delayMs, cb) => {
      armed.push({ delayMs, cb })
    },
    run: async () => {
      runCalls += 1
    },
    now: () => now,
    logger: {
      info: () => undefined,
      error: () => undefined,
    } as unknown as ClipScheduleDeps['logger'],
  }

  return {
    deps,
    zset,
    armed,
    getRunCalls: () => runCalls,
    setNow: (n: number) => {
      now = n
    },
  }
}

const PAYLOAD: ClipTaskPayload = {
  accountId: 'acct-1',
  matchId: '8821246401',
  detectPath: 'detect',
  opts: { maxAttempts: 1, pollAttempts: 1, pollIntervalMs: 1 },
  logPrefix: '[Clip]',
  logContext: { name: 'tester', matchId: '8821246401' },
}

// Build a persisted member exactly as scheduleClipWith would, for re-arm tests.
const makeMember = (executeAt: number) =>
  JSON.stringify({ id: `id-${executeAt}-${Math.random()}`, executeAt, ...PAYLOAD })

describe('clipSchedule', () => {
  let h: ReturnType<typeof makeDeps>

  beforeEach(() => {
    h = makeDeps()
  })

  it('persists the task to Redis and arms the in-process timer', async () => {
    await scheduleClipWith(h.deps, 5000, PAYLOAD)

    expect(h.zset.size).toBe(1)
    const [[member, score]] = [...h.zset.entries()]
    expect(score).toBe(1_000_000 + 5000)
    expect(JSON.parse(member).detectPath).toBe('detect')

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(5000)
  })

  it('runs the clip action and removes the member when the timer fires', async () => {
    await scheduleClipWith(h.deps, 5000, PAYLOAD)
    await h.armed[0].cb()

    expect(h.getRunCalls()).toBe(1)
    expect(h.zset.size).toBe(0) // member consumed
  })

  it('does not run twice if the same member fires again (ZREM guard)', async () => {
    await scheduleClipWith(h.deps, 5000, PAYLOAD)
    await h.armed[0].cb()
    await h.armed[0].cb() // e.g. a duplicate timer / stray re-arm

    expect(h.getRunCalls()).toBe(1)
  })

  it('re-arms a future-dated persisted task with the remaining delay', async () => {
    const member = makeMember(1_000_000 + 30_000)
    h.zset.set(member, 1_000_000 + 30_000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(30_000) // remaining delay
  })

  it('fires a recently-passed task immediately on re-arm', async () => {
    const member = makeMember(1_000_000 - 5_000) // 5s late, within staleness window
    h.zset.set(member, 1_000_000 - 5_000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(0)
    expect(h.zset.size).toBe(1) // not dropped; runs when the 0ms timer fires
  })

  it('drops a stale task (too late to capture the screen) without arming it', async () => {
    const member = makeMember(1_000_000 - 200_000) // way past the 90s window
    h.zset.set(member, 1_000_000 - 200_000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(0)
    expect(h.zset.size).toBe(0) // pruned
  })

  it('survives a restart: a dropped in-process timer is re-armed and fires once', async () => {
    await scheduleClipWith(h.deps, 5000, PAYLOAD)
    expect(h.armed).toHaveLength(1)

    // Simulate the process dying: the in-memory timer is gone, Redis kept the member.
    h.armed.length = 0
    expect(h.zset.size).toBe(1)

    await rearmWith(h.deps)
    expect(h.armed).toHaveLength(1)

    await h.armed[0].cb()
    expect(h.getRunCalls()).toBe(1)
    expect(h.zset.size).toBe(0)
  })
})
