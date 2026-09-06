import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'
import retry from 'retry'

import { logger } from './utils/logger'

class MongoDBSingleton {
  clientPromise: Promise<Db> | null = null
  mongoClient: MongoClient | null = null // Store the MongoClient object

  async connect(): Promise<Db> {
    // If the client promise is already resolved, return it
    if (this.clientPromise) {
      return await this.clientPromise
    }

    // Create a new promise that will be resolved with the MongoDB client
    this.clientPromise = new Promise((resolve, reject) => {
      // Set up the retry operation
      const operation = retry.operation({
        factor: 3, // Exponential backoff factor
        maxTimeout: 60 * 1000, // Maximum retry timeout (60 seconds)
        minTimeout: 1 * 1000, // Minimum retry timeout (1 second)
        retries: 5, // Number of retries
      })

      // Attempt to connect to MongoDB with the retry operation
      operation.attempt(async (currentAttempt) => {
        try {
          // Connect to MongoDB
          const mongoURL = process.env.MONGO_URL
          if (!mongoURL) {
            throw new Error('MONGO_URL not set')
          }
          const parsedUrl = new URL(mongoURL)
          const { host } = parsedUrl
          const client = await MongoClient.connect(mongoURL, {
            // Only use SSL for MongoDB Atlas
            ssl: host === 'mongodb.net' || host.endsWith('.mongodb.net'),
          })
          this.mongoClient = client // Store the MongoClient object

          // Resolve the promise with the client
          resolve(client.db())
        } catch (error: unknown) {
          console.log({ error })
          logger.info('Retrying mongo connection', { currentAttempt })
          // If the retry operation has been exhausted, reject the promise with the error
          if (operation.retry(error as Error)) {
            return
          }
          // Clear the cached promise so future connect() calls can retry with a
          // fresh attempt instead of returning this rejection forever
          this.clientPromise = null
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
