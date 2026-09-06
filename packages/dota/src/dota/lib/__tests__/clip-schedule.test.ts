import { beforeEach, describe, expect, it } from 'vitest'

import { rearmWith, scheduleClipWith } from '../clip-schedule.ts'
import type { ClipScheduleDeps, ClipTaskPayload } from '../clip-schedule.ts'

// Fully in-memory deps so the scheduling/re-arm logic is exercised offline with
// no Twitch, Redis, real timers, or process-wide module mocks (which would leak
// into sibling test files and break randomized ordering).
interface Captured {
  delayMs: number
  cb: () => void | Promise<void>
}

const makeDeps = function makeDeps() {
  const zset = new Map<string, number>()
  const armed: Captured[] = []
  let runCalls = 0
  let now = 1_000_000

  const deps: ClipScheduleDeps = {
    arm: (delayMs, cb) => {
      armed.push({ cb, delayMs })
    },
    logger: {
      error: () => {},
      info: () => {},
    },
    now: () => now,
    run: async () => {
      runCalls += 1
    },
    zAdd: async (member, score) => {
      zset.set(member, score)
      return 1
    },
    zRangeAll: async () => [...zset.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m),
    zRem: async (member) => (zset.delete(member) ? 1 : 0),
  }

  return {
    armed,
    deps,
    getRunCalls: () => runCalls,
    setNow: (n: number) => {
      now = n
    },
    zset,
  }
}

const PAYLOAD: ClipTaskPayload = {
  accountId: 'acct-1',
  detectPath: 'detect',
  logContext: { matchId: '8821246401', name: 'tester' },
  logPrefix: '[Clip]',
  matchId: '8821246401',
  opts: { maxAttempts: 1, pollAttempts: 1, pollIntervalMs: 1 },
}

// Build a persisted member exactly as scheduleClipWith would, for re-arm tests.
const makeMember = (executeAt: number) =>
  JSON.stringify({ executeAt, id: `id-${executeAt}-${Math.random()}`, ...PAYLOAD })

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
    // member consumed
    expect(h.zset.size).toBe(0)
  })

  it('does not run twice if the same member fires again (ZREM guard)', async () => {
    await scheduleClipWith(h.deps, 5000, PAYLOAD)
    await h.armed[0].cb()
    // e.g. a duplicate timer / stray re-arm
    await h.armed[0].cb()

    expect(h.getRunCalls()).toBe(1)
  })

  it('re-arms a future-dated persisted task with the remaining delay', async () => {
    const member = makeMember(1_000_000 + 30_000)
    h.zset.set(member, 1_000_000 + 30_000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(1)
    // remaining delay
    expect(h.armed[0].delayMs).toBe(30_000)
  })

  it('fires a recently-passed task immediately on re-arm', async () => {
    // 5s late, within staleness window
    const member = makeMember(1_000_000 - 5000)
    h.zset.set(member, 1_000_000 - 5000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(0)
    // not dropped; runs when the 0ms timer fires
    expect(h.zset.size).toBe(1)
  })

  it('drops a stale task (too late to capture the screen) without arming it', async () => {
    // way past the 90s window
    const member = makeMember(1_000_000 - 200_000)
    h.zset.set(member, 1_000_000 - 200_000)

    await rearmWith(h.deps)

    expect(h.armed).toHaveLength(0)
    // pruned
    expect(h.zset.size).toBe(0)
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
