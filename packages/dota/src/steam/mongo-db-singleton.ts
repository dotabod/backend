import { logger } from '@dotabod/shared-utils'
import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'
import retry from 'retry'

class MongoDBSingleton {
  clientPromise: Promise<Db> | null = null
  // Store the MongoClient object
  mongoClient: MongoClient | null = null

  async connect(): Promise<Db> {
    // If the client promise is already resolved, return it
    if (this.clientPromise) {
      return await this.clientPromise
    }

    // Create a new promise that will be resolved with the MongoDB client
    this.clientPromise = new Promise((resolve, reject) => {
      // Set up the retry operation
      const operation = retry.operation({
        // Exponential backoff factor
        factor: 3,
        // Maximum retry timeout (60 seconds)
        maxTimeout: 60 * 1000,
        // Minimum retry timeout (1 second)
        minTimeout: 1 * 1000,
        // Number of retries
        retries: 5,
      })

      // Attempt to connect to MongoDB with the retry operation
      operation.attempt(async (currentAttempt) => {
        try {
          // Connect to MongoDB
          const mongoURL = process.env.MONGO_URL!
          const client = await MongoClient.connect(mongoURL)
          // Store the MongoClient object
          this.mongoClient = client

          // Resolve the promise with the client
          resolve(client.db())
        } catch (error: unknown) {
          logger.info('Retrying mongo connection', { currentAttempt })
          // If the retry operation has been exhausted, reject the promise with the error
          if (operation.retry(error as Error)) {
            return
          }
          reject(error)
        }
      })
    })

    return await this.clientPromise
  }

  async close(): Promise<void> {
    // for now, don't close, because we call mongo so often i think it will
    // cause more problems than it solves
    // if (this.mongoClient) {
    //   await this.mongoClient.close()
    // }
    return
  }
}

export default new MongoDBSingleton()
