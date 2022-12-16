import { Db, MongoClient, ServerApiVersion } from 'mongodb'

export default class Mongo {
  private static instance: Mongo

  public db: Promise<Db>

  private client: Promise<MongoClient>

  private async connect(): Promise<Db> {
    try {
      const client = await MongoClient.connect(process.env.MONGO_URL!, {
        serverApi: ServerApiVersion.v1,
      })
      return client.db()
    } catch (error) {
      console.error('MONGO CONNECT ERR', error)
      throw error
    }
  }

  private constructor() {
    this.client = MongoClient.connect(process.env.MONGO_URL!, {
      serverApi: ServerApiVersion.v1,
    })
    this.db = this.connect()
  }

  public static getInstance(): Mongo {
    if (!Mongo.instance) Mongo.instance = new Mongo()
    return Mongo.instance
  }

  public exit(): Promise<boolean> {
    return new Promise((resolve) => {
      this.client
        .then((client) =>
          setTimeout(() => {
            client
              .close()
              .then(() => {
                console.log('Manually disconnected from mongo')
                resolve(true)
              })
              .catch((e) => {
                console.log(e)
              })
          }, 3000),
        )
        .catch((e) => {
          console.log(e)
        })
    })
  }
}
