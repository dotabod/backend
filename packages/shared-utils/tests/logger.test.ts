import { afterEach, describe, expect, it, mock } from 'bun:test'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  mock.restore()
})

describe('shared-utils logger', () => {
  it('constructs and logs without throwing when NEW_RELIC_LICENSE_KEY is absent', async () => {
    delete process.env.NEW_RELIC_LICENSE_KEY
    const { logger } = await import('../src/logger')
    expect(() => {
      logger.info('hello info')
      logger.warn('hello warn')
      logger.error('hello error', { extra: 'meta' })
    }).not.toThrow()
  })

  it('does not require newrelic when NEW_RELIC_LICENSE_KEY is absent', async () => {
    delete process.env.NEW_RELIC_LICENSE_KEY
    let nrRequired = false
    mock.module('newrelic', () => {
      nrRequired = true
      return { recordLogEvent: () => {} }
    })
    const { logger } = await import(`../src/logger?absent=${Date.now()}`)
    logger.info('should-not-touch-nr')
    await new Promise((r) => setTimeout(r, 10))
    expect(nrRequired).toBe(false)
  })

  it('survives if newrelic resolution throws when NEW_RELIC_LICENSE_KEY is set', async () => {
    process.env.NEW_RELIC_LICENSE_KEY = 'dummy-key-for-test'
    mock.module('newrelic', () => {
      throw new Error('simulated NR resolution failure')
    })
    const { logger } = await import(`../src/logger?fail=${Date.now()}`)
    expect(() => logger.info('should not crash even when NR require throws')).not.toThrow()
  })
})
