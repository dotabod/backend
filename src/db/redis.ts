import { SchemaFieldTypes, createClient } from 'redis'

export default class RedisClient {
  private static instance: RedisClient
  public client: ReturnType<typeof createClient>
  public subscriber: ReturnType<typeof createClient>

  private constructor() {
    const client = createClient()
    void client.connect()
    client.on('error', (err: any) => console.log('Redis Client Error', err))

    async function handler() {
      try {
        await client.ft.create(
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
        if (e.message === 'Index already exists') {
          console.log('Index exists already, skipped creation.')
        } else {
          // Something went wrong, perhaps RediSearch isn't installed...
          console.error(e)
          process.exit(1)
        }
      }
    }

    void handler()

    const subscriber = client.duplicate()
    void subscriber.connect()

    this.subscriber = subscriber
    this.client = client
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) RedisClient.instance = new RedisClient()
    return RedisClient.instance
  }
}
