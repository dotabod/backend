import { createClient } from 'redis'

import { logger } from '../utils/logger.js'

export default class RedisClient {
  private static instance: RedisClient
  public client: ReturnType<typeof createClient>
  public subscriber: ReturnType<typeof createClient>

  private constructor() {
    this.client = createClient({ url: 'redis://redis:6379' })
    this.subscriber = this.client.duplicate()

    this.setupConnection(this.client, 'client')
    this.setupConnection(this.subscriber, 'subscriber')
  }

  private setupConnection(connection: ReturnType<typeof createClient>, connectionName: string) {
    connection.on('error', (err: any) => {
      if (err?.code !== 'ENOTFOUND') return logger.error(`Redis ${connectionName} Error`, { err })
    })
    connection.once('connect', () => {
      logger.info(`[REDIS] Redis ${connectionName} connected`)
    })
  }

  public async connect(
    connection: ReturnType<typeof createClient>,
  ): Promise<ReturnType<typeof createClient>> {
    try {
      await connection.connect()
      return connection
    } catch (error) {
      logger.error('REDIS CONNECT ERR', { error })
      throw error
    }
  }

  public connectClient(): Promise<ReturnType<typeof createClient>> {
    return this.connect(this.client)
  }

  public connectSubscriber(): Promise<ReturnType<typeof createClient>> {
    return this.connect(this.subscriber)
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) RedisClient.instance = new RedisClient()
    return RedisClient.instance
  }
}
