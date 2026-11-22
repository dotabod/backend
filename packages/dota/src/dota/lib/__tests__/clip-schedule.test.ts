import { beforeEach, describe, expect, it } from 'vitest'

import { ClipScheduler } from '../clip-schedule.ts'
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
      await Promise.resolve()
    },
    zAdd: async (member, score) => {
      zset.set(member, score)
      return await Promise.resolve(1)
    },
    zRangeAll: async () =>
      await Promise.resolve([...zset.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m)),
    zRem: async (member) => await Promise.resolve(zset.delete(member) ? 1 : 0),
  }

  return {
    armed,
    deps,
    getRunCalls: () => runCalls,
    scheduler: new ClipScheduler(deps),
    setNow: (n: number) => {
      now = n
    },
    zset,
  }
}

const PAYLOAD: ClipTaskPayload = {
  accountId: 'acct-1',
  detectPath: 'detect',
  logContext: { matchId: '8821246401', name: 'tester', state: 'strategy' },
  logPrefix: '[Clip]',
  matchId: '8821246401',
  opts: { maxAttempts: 1, pollAttempts: 1, pollIntervalMs: 1 },
}

const makeMember = (executeAt: number) =>
  JSON.stringify({ executeAt, id: `id-${executeAt}-${Math.random()}`, ...PAYLOAD })

describe('clipSchedule', () => {
  let h: ReturnType<typeof makeDeps>

  beforeEach(() => {
    h = makeDeps()
  })

  it('persists the task to Redis and arms the in-process timer', async () => {
    await h.scheduler.schedule(5000, PAYLOAD)

    expect(h.zset.size).toBe(1)
    const [[member, score]] = [...h.zset.entries()]
    expect(score).toBe(1_000_000 + 5000)
    expect(JSON.parse(member).detectPath).toBe('detect')

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(5000)
  })

  it('runs the clip action and removes the member when the timer fires', async () => {
    await h.scheduler.schedule(5000, PAYLOAD)
    await h.armed[0].cb()

    expect(h.getRunCalls()).toBe(1)
    expect(h.zset.size).toBe(0)
  })

  it('runs an in-process task after a failed write when Redis recovers before it fires', async () => {
    h.deps.zAdd = () => Promise.reject(new Error('Redis unavailable'))

    await h.scheduler.schedule(5000, PAYLOAD)
    await h.armed[0].cb()

    expect(h.getRunCalls()).toBe(1)
    expect(h.zset.size).toBe(0)
  })

  it('coalesces overlapping draft observations and still schedules the other phases', async () => {
    await Promise.all([
      h.scheduler.schedule(46_000, { ...PAYLOAD, detectPath: 'detect_draft' }),
      h.scheduler.schedule(46_000, { ...PAYLOAD, detectPath: 'detect_draft' }),
      h.scheduler.schedule(43_750, PAYLOAD),
      h.scheduler.schedule(60_000, { ...PAYLOAD, detectPath: 'detect_in_game' }),
    ])

    expect(h.armed.map(({ delayMs }) => delayMs)).toStrictEqual([46_000, 43_750, 60_000])
  })

  it('keeps a strategy capture for each stream while coalescing repeats from a stream', async () => {
    await h.scheduler.schedule(5000, PAYLOAD)
    await h.scheduler.schedule(5000, { ...PAYLOAD, accountId: 'acct-2' })
    await h.scheduler.schedule(5000, PAYLOAD)

    expect(h.armed).toHaveLength(2)
  })

  it('does not run twice if the same member fires again (ZREM guard)', async () => {
    await h.scheduler.schedule(5000, PAYLOAD)
    await h.armed[0].cb()
    await h.armed[0].cb()

    expect(h.getRunCalls()).toBe(1)
  })

  it('re-arms a future-dated persisted task with the remaining delay', async () => {
    const member = makeMember(1_000_000 + 30_000)
    h.zset.set(member, 1_000_000 + 30_000)

    await h.scheduler.rearm()

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(30_000)
  })

  it('fires a recently-passed task immediately on re-arm', async () => {
    const member = makeMember(1_000_000 - 5000)
    h.zset.set(member, 1_000_000 - 5000)

    await h.scheduler.rearm()

    expect(h.armed).toHaveLength(1)
    expect(h.armed[0].delayMs).toBe(0)
    expect(h.zset.size).toBe(1)
  })

  it('drops a stale task (too late to capture the screen) without arming it', async () => {
    const member = makeMember(1_000_000 - 200_000)
    h.zset.set(member, 1_000_000 - 200_000)

    await h.scheduler.rearm()

    expect(h.armed).toHaveLength(0)
    expect(h.zset.size).toBe(0)
  })

  it('survives a restart: a dropped in-process timer is re-armed and fires once', async () => {
    await h.scheduler.schedule(5000, PAYLOAD)
    expect(h.armed).toHaveLength(1)

    h.armed.length = 0
    expect(h.zset.size).toBe(1)

    const restarted = new ClipScheduler(h.deps)
    await restarted.rearm()
    await restarted.schedule(5000, PAYLOAD)
    expect(h.armed).toHaveLength(1)

    await h.armed[0].cb()
    expect(h.getRunCalls()).toBe(1)
    expect(h.zset.size).toBe(0)
  })
})
