import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DelayedQueue } from '../delayed-queue'

describe(DelayedQueue, () => {
  let queue: DelayedQueue

  beforeEach(() => {
    vi.useFakeTimers()
    queue = new DelayedQueue()
  })

  afterEach(async () => {
    await queue.shutdown()
    vi.useRealTimers()
  })

  it('uses the returned ID to cancel only the selected task', async () => {
    const callback = vi.fn<(payload: string) => void>()
    const canceled = queue.addTask(100, callback, 'canceled')
    queue.addTask(100, callback, 'kept')

    expect(queue.removeTask(canceled)).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)

    expect(callback).toHaveBeenCalledExactlyOnceWith('kept')
  })

  it('does not execute a task before its delay expires', async () => {
    const callback = vi.fn<(payload: string) => void>()
    queue.addTask(1500, callback, 'ready')

    await vi.advanceTimersByTimeAsync(1000)
    expect(callback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(callback).toHaveBeenCalledExactlyOnceWith('ready')
  })

  it('starts due tasks by execution time, then by ascending priority, then by arrival', async () => {
    const order: string[] = []
    const record = (name: string): void => {
      order.push(name)
    }
    queue.addTask(200, record, 'later', 0)
    queue.addTask(100, record, 'lower priority', 3)
    queue.addTask(100, record, 'first high priority', 1)
    queue.addTask(100, record, 'second high priority', 1)
    queue.addTask(50, record, 'earliest', 5)

    await vi.advanceTimersByTimeAsync(1000)

    expect(order).toStrictEqual([
      'earliest',
      'first high priority',
      'second high priority',
      'lower priority',
      'later',
    ])
  })

  it('continues processing after a callback fails', async () => {
    const goodCallback = vi.fn<() => void>()
    const badCallback = vi.fn(() => {
      throw new Error('Test error')
    })
    queue.addTask(50, badCallback)
    queue.addTask(1100, goodCallback)

    await vi.advanceTimersByTimeAsync(2000)

    expect(badCallback).toHaveBeenCalledOnce()
    expect(goodCallback).toHaveBeenCalledOnce()
  })

  it('clamps delays to fifty minutes', () => {
    const callback = vi.fn<() => void>()
    const maxDelay = 50 * 60 * 1000
    queue.addTask(60 * 60 * 1000, callback)

    vi.advanceTimersByTime(maxDelay - 1)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('executes pending tasks on shutdown when requested', async () => {
    const callback = vi.fn<(payload: string) => void>()
    queue.addTask(1000, callback, 'pending')

    await queue.shutdown(true)

    expect(callback).toHaveBeenCalledExactlyOnceWith('pending')
  })

  it('cancels pending tasks on shutdown by default', async () => {
    const callback = vi.fn<() => void>()
    queue.addTask(1000, callback)

    await queue.shutdown()
    await vi.advanceTimersByTimeAsync(1000)

    expect(callback).not.toHaveBeenCalled()
  })
})
