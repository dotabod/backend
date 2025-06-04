import { logger } from '@dotabod/shared-utils'

export interface DelayedTask {
  id: string
  executeAt: number
  priority: number
  payload: any
  callback: (payload: any) => void | Promise<void>
}

export class DelayedQueue {
  private tasks: DelayedTask[] = []
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false
  private readonly checkInterval = 1000 // Check every second
  private readonly maxDelayMs = 50 * 60 * 1000 // 50 minutes max

  constructor() {
    this.start()
  }

  addTask(
    delayMs: number,
    callback: (payload: any) => void | Promise<void>,
    payload: any = null,
    priority: number = 0,
  ): string {
    // Clamp delay to maximum allowed
    const clampedDelay = Math.min(delayMs, this.maxDelayMs)
    const taskId = this.generateTaskId()
    const executeAt = Date.now() + clampedDelay

    const task: DelayedTask = {
      id: taskId,
      executeAt,
      priority,
      payload,
      callback,
    }

    // Insert task in sorted order (by executeAt, then by priority)
    this.insertTaskSorted(task)
    
    logger.info(`DelayedQueue: Added task ${taskId} to execute in ${clampedDelay}ms`)
    return taskId
  }

  removeTask(taskId: string): boolean {
    const initialLength = this.tasks.length
    this.tasks = this.tasks.filter(task => task.id !== taskId)
    return this.tasks.length < initialLength
  }

  getQueueSize(): number {
    return this.tasks.length
  }

  getNextTaskTime(): number | null {
    return this.tasks.length > 0 ? this.tasks[0].executeAt : null
  }

  private insertTaskSorted(newTask: DelayedTask): void {
    // Binary search insertion to maintain sorted order
    let left = 0
    let right = this.tasks.length

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      const midTask = this.tasks[mid]

      if (midTask.executeAt < newTask.executeAt || 
          (midTask.executeAt === newTask.executeAt && midTask.priority <= newTask.priority)) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    this.tasks.splice(left, 0, newTask)
  }

  private start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.intervalId = setInterval(() => {
      this.processTasks()
    }, this.checkInterval)

    logger.info('DelayedQueue: Started processing')
  }

  private async processTasks(): Promise<void> {
    const now = Date.now()
    const tasksToExecute: DelayedTask[] = []

    // Collect all tasks that are ready to execute
    while (this.tasks.length > 0 && this.tasks[0].executeAt <= now) {
      tasksToExecute.push(this.tasks.shift()!)
    }

    // Execute tasks concurrently
    if (tasksToExecute.length > 0) {
      logger.info(`DelayedQueue: Executing ${tasksToExecute.length} tasks`)
      
      await Promise.allSettled(
        tasksToExecute.map(async (task) => {
          try {
            await task.callback(task.payload)
            logger.debug(`DelayedQueue: Successfully executed task ${task.id}`)
          } catch (error) {
            logger.error(`DelayedQueue: Error executing task ${task.id}`, { error })
          }
        })
      )
    }
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    logger.info('DelayedQueue: Stopped processing')
  }

  // Graceful shutdown - execute remaining tasks or clear them
  async shutdown(executeRemaining: boolean = false): Promise<void> {
    this.stop()
    
    if (executeRemaining && this.tasks.length > 0) {
      logger.info(`DelayedQueue: Executing ${this.tasks.length} remaining tasks during shutdown`)
      
      await Promise.allSettled(
        this.tasks.map(async (task) => {
          try {
            await task.callback(task.payload)
          } catch (error) {
            logger.error(`DelayedQueue: Error executing task ${task.id} during shutdown`, { error })
          }
        })
      )
    }
    
    this.tasks = []
    logger.info('DelayedQueue: Shutdown complete')
  }
}

// Singleton instance
export const delayedQueue = new DelayedQueue()