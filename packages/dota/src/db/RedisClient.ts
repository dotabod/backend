import { createClient } from 'redis'

import { logger } from '../utils/logger.js'

class RedisClient {
  private static instance: RedisClient
  public client: ReturnType<typeof createClient>
  public subscriber: ReturnType<typeof createClient>

  private constructor() {
    this.client = createClient({ url: `redis://${process.env.HOST_REDIS}:6379` })
    this.subscriber = this.client.duplicate()

    // Handle process exit to close Redis connections properly
    process.on('exit', this.closeConnections.bind(this))
    process.on('SIGINT', this.closeConnections.bind(this))
    process.on('SIGTERM', this.closeConnections.bind(this))
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

  private async closeConnections() {
    try {
      await this.client.quit()
      await this.subscriber.quit()
      logger.info('Redis connections closed successfully')
    } catch (error) {
      logger.error('Error closing Redis connections', { error })
    }
  }
}

export default RedisClient
