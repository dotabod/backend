import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { scheduleNonOverlapping } from '../scheduler.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scheduleNonOverlapping', () => {
  it('skips a tick if the previous invocation is still in flight', async () => {
    let active = 0
    let maxConcurrent = 0
    let runs = 0
    const resolvers: Array<() => void> = []

    const stop = scheduleNonOverlapping(() => {
      runs++
      active++
      maxConcurrent = Math.max(maxConcurrent, active)
      return new Promise<void>((r) => {
        resolvers.push(() => {
          active--
          r()
        })
      })
    }, 1000)

    // First tick fires.
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(1)
    expect(active).toBe(1)

    // Second tick fires while first is still in flight → must be skipped.
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(1)
    expect(maxConcurrent).toBe(1)

    // Complete the first run.
    resolvers.shift()?.()
    await vi.advanceTimersByTimeAsync(0)

    // Third tick fires; previous is done so this one runs.
    await vi.advanceTimersByTimeAsync(1000)
    expect(runs).toBe(2)
    expect(maxConcurrent).toBe(1)

    resolvers.shift()?.()
    stop()
  })

  it('continues firing after a rejected promise (does not get stuck)', async () => {
    let runs = 0
    const stop = scheduleNonOverlapping(async () => {
      runs++
      throw new Error('boom')
    }, 500)

    await vi.advanceTimersByTimeAsync(500)
    // Let the rejection flush.
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
      runs++
    }, 100)

    await vi.advanceTimersByTimeAsync(100)
    expect(runs).toBe(1)

    stop()
    await vi.advanceTimersByTimeAsync(500)
    expect(runs).toBe(1)
  })
})
