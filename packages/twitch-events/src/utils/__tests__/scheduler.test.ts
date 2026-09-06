import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scheduleNonOverlapping } from '../scheduler.ts'

describe(scheduleNonOverlapping, () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips a tick if the previous invocation is still in flight', async () => {
    let active = 0
    let maxConcurrent = 0
    let runs = 0
    const completions: WritableStreamDefaultWriter<boolean>[] = []

    const stop = scheduleNonOverlapping(async () => {
      runs += 1
      active += 1
      maxConcurrent = Math.max(maxConcurrent, active)
      const completion = new TransformStream<boolean, boolean>()
      completions.push(completion.writable.getWriter())
      await completion.readable.getReader().read()
      active -= 1
    }, 1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect({ active, maxConcurrent, runs }).toStrictEqual({ active: 1, maxConcurrent: 1, runs: 1 })

    await vi.advanceTimersByTimeAsync(1000)
    expect({ active, maxConcurrent, runs }).toStrictEqual({ active: 1, maxConcurrent: 1, runs: 1 })

    await completions.shift()?.write(true)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect({ maxConcurrent, runs }).toStrictEqual({ maxConcurrent: 1, runs: 2 })

    await completions.shift()?.write(true)
    stop()
  })

  it('continues firing after a rejected promise (does not get stuck)', async () => {
    let runs = 0
    const stop = scheduleNonOverlapping(async () => {
      runs += 1
      await Promise.reject(new Error('boom'))
    }, 500)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(0)
    expect(runs).toBe(1)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(0)
    expect(runs).toBe(2)

    stop()
  })

  it('stop() prevents future invocations', async () => {
    let runs = 0
    const stop = scheduleNonOverlapping(async () => {
      runs += 1
      await Promise.resolve()
    }, 100)

    await vi.advanceTimersByTimeAsync(100)
    expect(runs).toBe(1)

    stop()
    await vi.advanceTimersByTimeAsync(500)
    expect(runs).toBe(1)
  })
})
