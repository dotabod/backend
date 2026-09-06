import { setTimeout as delay } from 'node:timers/promises'

import { MongoClient } from 'mongodb'
import type { Db, MongoClientOptions } from 'mongodb'

import { logger } from './utils/logger'

interface MongoConnection<TDatabase> {
  db: () => TDatabase
}

export interface MongoConnectionDependencies<TDatabase> {
  connectClient: (
    mongoUrl: string,
    options: MongoClientOptions
  ) => Promise<MongoConnection<TDatabase>>
  getMongoUrl: () => string | undefined
  maxAttempts: number
  onRetry: (attempt: number) => void
  waitForRetry: (delayMs: number) => Promise<void>
}

const defaultDependencies: MongoConnectionDependencies<Db> = {
  connectClient: async (mongoUrl, options) => await MongoClient.connect(mongoUrl, options),
  getMongoUrl: () => process.env.MONGO_URL,
  maxAttempts: 6,
  onRetry: (attempt) => {
    logger.info('Retrying mongo connection', { currentAttempt: attempt })
  },
  waitForRetry: async (delayMs) => {
    await delay(delayMs)
  },
}

const keepConnectionOpen = (): void => {
  // Callers share one long-lived client; closing per query would defeat the cache.
}

export class MongoConnectionCache<TDatabase> {
  private clientPromise: Promise<TDatabase> | null = null
  private readonly dependencies: MongoConnectionDependencies<TDatabase>

  constructor(dependencies: MongoConnectionDependencies<TDatabase>) {
    this.dependencies = dependencies
  }

  async connect(): Promise<TDatabase> {
    this.clientPromise ??= this.connectWithRetry(1)
    return await this.clientPromise
  }

  readonly close = keepConnectionOpen

  private async connectWithRetry(attempt: number): Promise<TDatabase> {
    try {
      const mongoUrl = this.dependencies.getMongoUrl()
      if (mongoUrl === undefined || mongoUrl.length === 0) {
        throw new Error('MONGO_URL not set')
      }

      const { host } = new URL(mongoUrl)
      const client = await this.dependencies.connectClient(mongoUrl, {
        ssl: host === 'mongodb.net' || host.endsWith('.mongodb.net'),
      })
      return client.db()
    } catch (error) {
      const connectionError =
        error instanceof Error ? error : new Error('Mongo connection failed', { cause: error })
      this.dependencies.onRetry(attempt)
      if (attempt >= this.dependencies.maxAttempts) {
        this.clientPromise = null
        throw connectionError
      }

      const retryDelayMs = Math.min(60_000, 1000 * 3 ** (attempt - 1))
      await this.dependencies.waitForRetry(retryDelayMs)
      return await this.connectWithRetry(attempt + 1)
    }
  }
}

export default new MongoConnectionCache(defaultDependencies)
