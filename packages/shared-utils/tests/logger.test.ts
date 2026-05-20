import { afterEach, describe, expect, it, mock } from 'bun:test'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  mock.restore()
})

describe('shared-utils logger', () => {
  it('constructs and logs without throwing', async () => {
    const { logger } = await import('../src/logger')
    expect(() => {
      logger.info('hello info')
      logger.warn('hello warn')
      logger.error('hello error', { extra: 'meta' })
    }).not.toThrow()
  })
})
