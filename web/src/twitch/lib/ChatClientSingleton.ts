import { ChatClient } from '@twurple/chat'
import retry from 'retry'

import { getAuthProvider } from './getAuthProvider.js'

class ChatClientSingleton {
  private clientPromise: Promise<ChatClient> | null = null

  async connect(): Promise<ChatClient> {
    // If the client promise is already resolved, return it
    if (this.clientPromise) {
      return this.clientPromise
    }

    // Create a new promise that will be resolved with the twitch client
    this.clientPromise = new Promise((resolve, reject) => {
      // Set up the retry operation
      const operation = retry.operation({
        retries: 5, // Number of retries
        factor: 3, // Exponential backoff factor
        minTimeout: 1 * 1000, // Minimum retry timeout (1 second)
        maxTimeout: 60 * 1000, // Maximum retry timeout (60 seconds)
      })

      // Attempt to connect to twitch with the retry operation
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      operation.attempt(async (currentAttempt) => {
        try {
          const chatClient = new ChatClient({
            isAlwaysMod: true,
            authProvider: getAuthProvider(),
          })

          // Connect to twitch
          await chatClient.connect()

          // Resolve the promise with the client
          resolve(chatClient)
        } catch (error: any) {
          console.log('Retrying twitch chat connection', currentAttempt)
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

export default new ChatClientSingleton()
