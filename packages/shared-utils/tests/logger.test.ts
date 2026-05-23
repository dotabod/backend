import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createAppLogger } from '../src/logger-impl'

// Build the genuine winston logger directly from the factory rather than mocking
// '../src/logger'. Sibling tests' setupMocks globally mock that module (no
// transports); re-pointing it here leaked the real logger into other files via
// mock.restore(), so we avoid touching the module mock entirely.

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

// Winston delivers to transports via a stream, so flush a tick before asserting.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function captureLogs(emit: (logger: any) => void) {
  const logger = createAppLogger()
  const transport = logger.transports[0]
  const captured: any[] = []
  vi.spyOn(transport, 'log').mockImplementation((info: any, next?: () => void) => {
    captured.push(info)
    next?.()
  })
  emit(logger)
  await flush()
  return captured
}

describe('shared-utils logger', () => {
  it('passes level, message and structured metadata through to the transport', async () => {
    const captured = await captureLogs((logger) => logger.error('boom', { requestId: 'abc-123' }))

    expect(captured).toHaveLength(1)
    const info = captured[0]
    expect(info.level).toContain('error')
    expect(info.message).toBe('boom')
    expect(info.requestId).toBe('abc-123')
    // The printf format renders a single line carrying message + metadata.
    const line = String(info[Symbol.for('message')])
    expect(line).toContain('boom')
    expect(line).toContain('abc-123')
  })

  it('extracts the stack when an Error is supplied as metadata', async () => {
    const err = new Error('kaboom')
    const captured = await captureLogs((logger) => logger.error('failed', { e: err }))

    expect(captured).toHaveLength(1)
    expect(captured[0]['e.stack']).toContain('kaboom')
  })
})
