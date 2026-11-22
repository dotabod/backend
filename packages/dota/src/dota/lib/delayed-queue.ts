import { logger } from '@dotabod/shared-utils'

export interface DelayedTask<T = unknown> {
  id: string
  executeAt: number
  priority: number
  payload: T
  callback: (payload: T) => void | Promise<void>
}

export class DelayedQueue {
  private tasks: DelayedTask[] = []
  private readonly intervalId: NodeJS.Timeout
  private readonly checkInterval = 1000
  private readonly maxDelayMs = 50 * 60 * 1000

  constructor() {
    this.intervalId = setInterval(() => {
      void this.processTasks()
    }, this.checkInterval)
    logger.info('DelayedQueue: Started processing')
  }

  addTask<T = unknown>(
    delayMs: number,
    callback: (payload: T) => void | Promise<void>,
    payload: T = null as T,
    priority = 0
  ): string {
    const clampedDelay = Math.min(delayMs, this.maxDelayMs)
    const taskId = this.generateTaskId()
    const executeAt = Date.now() + clampedDelay

    const task: DelayedTask<T> = {
      callback,
      executeAt,
      id: taskId,
      payload,
      priority,
    }

    this.insertTaskSorted(task as DelayedTask)

    return taskId
  }

  removeTask(taskId: string): boolean {
    const initialLength = this.tasks.length
    this.tasks = this.tasks.filter((task) => task.id !== taskId)
    return this.tasks.length < initialLength
  }

  private insertTaskSorted(newTask: DelayedTask): void {
    let left = 0
    let right = this.tasks.length

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      const midTask = this.tasks[mid]

      if (
        midTask.executeAt < newTask.executeAt ||
        (midTask.executeAt === newTask.executeAt && midTask.priority <= newTask.priority)
      ) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    this.tasks.splice(left, 0, newTask)
  }

  private async processTasks(): Promise<void> {
    const now = Date.now()
    const tasksToExecute: DelayedTask[] = []

    while (this.tasks.length > 0 && this.tasks[0].executeAt <= now) {
      tasksToExecute.push(this.tasks.shift()!)
    }

    if (tasksToExecute.length > 0) {
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

  async shutdown(executeRemaining = false): Promise<void> {
    clearInterval(this.intervalId)

    if (executeRemaining && this.tasks.length > 0) {
      logger.info(`DelayedQueue: Executing ${this.tasks.length} remaining tasks during shutdown`)

      await Promise.allSettled(
        this.tasks.map(async (task) => {
          try {
            await task.callback(task.payload)
          } catch (error) {
            logger.error(`DelayedQueue: Error executing task ${task.id} during shutdown`, {
              error,
            })
          }
        })
      )
    }

    this.tasks = []
    logger.info('DelayedQueue: Shutdown complete')
  }
}

export const delayedQueue = new DelayedQueue()
