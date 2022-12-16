import { SchemaFieldTypes, createClient } from 'redis'

export default class RedisClient {
  private static instance: RedisClient
  public client: ReturnType<typeof createClient>
  public subscriber: ReturnType<typeof createClient>

  private constructor() {
    this.client = createClient({ url: 'redis://redis:6379' })
    this.subscriber = this.client.duplicate()

    this.client.on('error', (err: any) => console.log('Redis Client Error', err))
    this.client.once('connect', () => {
      console.log('[REDIS]', 'Redis client connected')
      void this.createIndex()
    })
  }

  public connectClient() {
    try {
      return this.client.connect()
    } catch (error) {
      console.error('REDIS CONNECT ERR', error)
      throw error
    }
  }

  public connectSubscriber() {
    try {
      return this.subscriber.connect()
    } catch (error) {
      console.error('REDIS CONNECT ERR', error)
      throw error
    }
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) RedisClient.instance = new RedisClient()
    return RedisClient.instance
  }

  public async createIndex(): Promise<void> {
    try {
      await this.client.ft.create(
        'idx:users',
        {
          '$.name': {
            type: SchemaFieldTypes.TEXT,
            AS: 'name',
          },
          '$.Account.providerAccountId': {
            type: SchemaFieldTypes.TEXT,
            AS: 'twitchId',
          },
        },
        {
          ON: 'JSON',
          PREFIX: 'users',
        },
      )
    } catch (e: any) {
      if (e.message !== 'Index already exists') {
        // Something went wrong, perhaps RediSearch isn't installed...
        console.error(e)
        process.exit(1)
      }
    }
  }
}
