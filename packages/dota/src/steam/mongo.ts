import { Db, MongoClient } from 'mongodb'
import retry from 'retry'

import { logger } from '../utils/logger.js'

class MongoDBSingleton {
  private clientPromise: Promise<Db> | null = null

  async connect(): Promise<Db> {
    // If the client promise is already resolved, return it
    if (this.clientPromise) {
      return this.clientPromise
    }

    // Create a new promise that will be resolved with the MongoDB client
    this.clientPromise = new Promise((resolve, reject) => {
      // Set up the retry operation
      const operation = retry.operation({
        retries: 5, // Number of retries
        factor: 3, // Exponential backoff factor
        minTimeout: 1 * 1000, // Minimum retry timeout (1 second)
        maxTimeout: 60 * 1000, // Maximum retry timeout (60 seconds)
      })

      // Attempt to connect to MongoDB with the retry operation
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      operation.attempt(async (currentAttempt) => {
        try {
          // Connect to MongoDB
          const mongoURL =
            process.env.NODE_ENV === 'production'
              ? process.env.MONGO_URL!
              : 'mongodb://mongodb:27017'
          const client = await MongoClient.connect(mongoURL)

          // Resolve the promise with the client
          resolve(client.db())
        } catch (error: any) {
          logger.info('Retrying mongo connection', { currentAttempt })
          // If the retry operation has been exhausted, reject the promise with the error
          if (operation.retry(error)) {
            return
          }
          reject(error)
        }
      })
    })

    return this.clientPromise
  }
}

export default new MongoDBSingleton()
