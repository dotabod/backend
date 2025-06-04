import { DelayedQueue } from '../DelayedQueue.js'

describe('DelayedQueue', () => {
  let queue: DelayedQueue

  beforeEach(() => {
    queue = new DelayedQueue()
  })

  afterEach(() => {
    queue.shutdown()
  })

  it('should add tasks to the queue', () => {
    const callback = jest.fn()
    const taskId = queue.addTask(1000, callback, 'test payload')
    
    expect(taskId).toBeDefined()
    expect(queue.getQueueSize()).toBe(1)
  })

  it('should execute tasks after delay', async () => {
    const callback = jest.fn()
    const payload = { test: 'data' }
    
    queue.addTask(100, callback, payload)
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    expect(callback).toHaveBeenCalledWith(payload)
    expect(queue.getQueueSize()).toBe(0)
  })

  it('should execute tasks in order of execution time', async () => {
    const results: number[] = []
    
    queue.addTask(200, () => results.push(2))
    queue.addTask(100, () => results.push(1))
    queue.addTask(300, () => results.push(3))
    
    await new Promise(resolve => setTimeout(resolve, 350))
    
    expect(results).toEqual([1, 2, 3])
  })

  it('should respect priority when execution times are equal', async () => {
    const results: number[] = []
    const delay = 100
    
    // Add tasks with same delay but different priorities
    queue.addTask(delay, () => results.push(3), null, 1) // Lower priority
    queue.addTask(delay, () => results.push(1), null, 3) // Higher priority  
    queue.addTask(delay, () => results.push(2), null, 2) // Medium priority
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    expect(results).toEqual([1, 2, 3]) // Higher priority first
  })

  it('should remove tasks from queue', () => {
    const callback = jest.fn()
    const taskId = queue.addTask(1000, callback)
    
    expect(queue.getQueueSize()).toBe(1)
    
    const removed = queue.removeTask(taskId)
    expect(removed).toBe(true)
    expect(queue.getQueueSize()).toBe(0)
  })

  it('should handle errors in task callbacks gracefully', async () => {
    const goodCallback = jest.fn()
    const badCallback = jest.fn(() => {
      throw new Error('Test error')
    })
    
    queue.addTask(50, badCallback)
    queue.addTask(100, goodCallback)
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    expect(badCallback).toHaveBeenCalled()
    expect(goodCallback).toHaveBeenCalled()
  })

  it('should clamp delays to maximum allowed', () => {
    const callback = jest.fn()
    const maxDelay = 50 * 60 * 1000 // 50 minutes
    const excessiveDelay = 60 * 60 * 1000 // 60 minutes
    
    queue.addTask(excessiveDelay, callback)
    
    const nextTaskTime = queue.getNextTaskTime()
    expect(nextTaskTime).toBeLessThanOrEqual(Date.now() + maxDelay)
  })

  it('should execute remaining tasks during shutdown', async () => {
    const callback = jest.fn()
    
    queue.addTask(1000, callback, 'test') // Long delay
    
    await queue.shutdown(true)
    
    expect(callback).toHaveBeenCalledWith('test')
  })

  it('should clear tasks during shutdown without execution', async () => {
    const callback = jest.fn()
    
    queue.addTask(1000, callback)
    expect(queue.getQueueSize()).toBe(1)
    
    await queue.shutdown(false)
    
    expect(callback).not.toHaveBeenCalled()
    expect(queue.getQueueSize()).toBe(0)
  })
})