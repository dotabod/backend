import { describe, expect, it } from 'vitest'

import { MongoConnectionCache } from '../mongo-db-singleton'

interface FakeDatabase {
  name: string
}

const fakeDb: FakeDatabase = { name: 'fake-db' }

describe(MongoConnectionCache, () => {
  it('starts a fresh attempt after a rejected connection', async () => {
    let connectAttempts = 0
    const retryAttempts: number[] = []
    const cache = new MongoConnectionCache<FakeDatabase>({
      connectClient: async () => {
        connectAttempts += 1
        if (connectAttempts === 1) {
          throw new Error('mongo down')
        }
        return await Promise.resolve({ db: () => fakeDb })
      },
      getMongoUrl: () => 'mongodb://localhost:27017/dotabod-test',
      maxAttempts: 1,
      onRetry: (attempt) => {
        retryAttempts.push(attempt)
      },
      waitForRetry: async () => {
        await Promise.resolve()
      },
    })

    await expect(cache.connect()).rejects.toThrow('mongo down')
    await expect(cache.connect()).resolves.toBe(fakeDb)
    expect({ connectAttempts, retryAttempts }).toStrictEqual({
      connectAttempts: 2,
      retryAttempts: [1],
    })
  })

  it('reuses a successful connection', async () => {
    let connectAttempts = 0
    const cache = new MongoConnectionCache<FakeDatabase>({
      connectClient: async () => {
        connectAttempts += 1
        return await Promise.resolve({ db: () => fakeDb })
      },
      getMongoUrl: () => 'mongodb://localhost:27017/dotabod-test',
      maxAttempts: 1,
      onRetry: () => {
        throw new Error('Successful connection should not retry')
      },
      waitForRetry: async () => {
        await Promise.resolve()
      },
    })

    await expect(cache.connect()).resolves.toBe(fakeDb)
    await expect(cache.connect()).resolves.toBe(fakeDb)
    expect(connectAttempts).toBe(1)
  })
})
