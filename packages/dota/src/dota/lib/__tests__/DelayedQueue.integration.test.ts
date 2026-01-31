/**
 * Integration test for DelayedQueue without external dependencies
 */

import { describe, it, expect } from 'bun:test'
import { DelayedQueue } from '../DelayedQueue.js'

describe('DelayedQueue Integration', () => {
  // Note: DelayedQueue uses 1-second check interval, so tests need to wait > 1s
  // Lower priority number = higher priority (standard convention)
  it('should handle multiple tasks with different delays and priorities', async () => {
    const queue = new DelayedQueue()
    const results: string[] = []

    // Add tasks with different delays and priorities
    queue.addTask(50, () => results.push('task1'), null, 1) // 50ms, priority 1 (higher)
    queue.addTask(50, () => results.push('task2'), null, 3) // 50ms, priority 3 (lower)
    queue.addTask(100, () => results.push('task3'), null, 1) // 100ms, priority 1
    queue.addTask(25, () => results.push('task4'), null, 1) // 25ms, priority 1

    // Wait for queue's 1-second check interval to process all tasks
    await new Promise((resolve) => setTimeout(resolve, 1200))

    // Verify execution order: task4 (25ms), then task1 (50ms, priority 1),
    // then task2 (50ms, priority 3), then task3 (100ms)
    expect(results).toEqual(['task4', 'task1', 'task2', 'task3'])

    await queue.shutdown()
  })

  it('should demonstrate queue efficiency vs setTimeout', () => {
    const queue = new DelayedQueue()
    const startTime = Date.now()

    // Add 1000 tasks
    for (let i = 0; i < 1000; i++) {
      queue.addTask(5000, () => {}, `task_${i}`) // 5 second delay each
    }

    const setupTime = Date.now() - startTime

    // Queue setup should be very fast (much less than if we used 1000 setTimeout calls)
    expect(setupTime).toBeLessThan(100) // Should complete in under 100ms
    expect(queue.getQueueSize()).toBe(1000)

    queue.shutdown()
  })
})
