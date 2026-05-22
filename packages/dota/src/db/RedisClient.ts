import { logger } from '@dotabod/shared-utils'
import type { RedisJSON } from '@redis/json/dist/commands'
import { createClient } from 'redis'

class RedisClient {
  private static instance: RedisClient
  public client: ReturnType<typeof createClient>
  public subscriber: ReturnType<typeof createClient>

  private constructor() {
    this.client = createClient({ url: `redis://${process.env.HOST_REDIS}:6379` })
    this.subscriber = this.client.duplicate()
  }

  /** Reads a JSON value stored at `key`, typed as `T`. Returns null when the key is absent. */
  public async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.json.get(key)
    if (value === null || value === undefined) return null
    return value as unknown as T
  }

  /** Stores `value` as JSON at `key`. */
  public setJson(key: string, value: unknown): Promise<string | null> {
    return this.client.json.set(key, '$', value as RedisJSON)
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

export default RedisClient
