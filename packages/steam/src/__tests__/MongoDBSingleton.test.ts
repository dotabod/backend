import { describe, expect, it, vi } from 'vite-plus/test'

// Regression test for the cached-rejection bug: a failed connect() used to leave
// the rejected promise on the singleton, so every later connect() returned that
// same rejection until process restart.

let connectAttempts = 0
const fakeDb = { name: 'fake-db' }

// connect() reads MONGO_URL at call time and parses it with new URL().
process.env.MONGO_URL = 'mongodb://localhost:27017/dotabod-test'

vi.doMock('mongodb', () => ({
  MongoClient: {
    connect: async () => {
      connectAttempts++
      if (connectAttempts === 1) throw new Error('mongo down')
      return { db: () => fakeDb }
    },
  },
}))

// Drive every attempt synchronously and treat each failure as final (no real
// backoff timers in tests).
vi.doMock('retry', () => ({
  default: {
    operation: () => ({
      attempt: (cb: (currentAttempt: number) => void) => cb(1),
      retry: () => false,
    }),
  },
}))

vi.doMock('../utils/logger', () => ({
  logger: {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
  },
}))

const { default: mongoSingleton } = await import('../MongoDBSingleton')

describe('MongoDBSingleton.connect', () => {
  it('starts a fresh attempt after a rejection instead of returning the cached rejection forever', async () => {
    // First connect exhausts retries and rejects.
    await expect(mongoSingleton.connect()).rejects.toThrow('mongo down')
    expect(connectAttempts).toBe(1)

    // Second connect must create a NEW connection attempt — the bug returned
    // the same rejected promise here, so connect was never called again.
    await expect(mongoSingleton.connect()).resolves.toBe(fakeDb)
    expect(connectAttempts).toBe(2)

    // The resolved client is cached: further calls reuse it without reconnecting.
    await expect(mongoSingleton.connect()).resolves.toBe(fakeDb)
    expect(connectAttempts).toBe(2)
  })
})
