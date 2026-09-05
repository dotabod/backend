import { describe, expect, it, vi } from 'vitest'

// retryTransient only pulls `logger` from the shared-utils barrel; stub it so
// the test stays offline and doesn't initialise the real winston/supabase deps.
vi.doMock(import('@dotabod/shared-utils'), () => ({
  logger: {
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  },
}))

const { isTransientNetworkError, retryTransient } = await import('../retryTransient')

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code })

describe('isTransientNetworkError', () => {
  it('flags node-fetch ERR_STREAM_PREMATURE_CLOSE by code', () => {
    expect(isTransientNetworkError(withCode('boom', 'ERR_STREAM_PREMATURE_CLOSE'))).toBeTruthy()
  })

  it('flags premature close by message when no code is present', () => {
    expect(
      isTransientNetworkError(
        new Error('Invalid response body while trying to fetch ...: Premature close')
      )
    ).toBeTruthy()
  })

  it('flags ECONNRESET / ETIMEDOUT / socket hang up', () => {
    expect(isTransientNetworkError(withCode('x', 'ECONNRESET'))).toBeTruthy()
    expect(isTransientNetworkError(withCode('x', 'ETIMEDOUT'))).toBeTruthy()
    expect(isTransientNetworkError(new Error('socket hang up'))).toBeTruthy()
  })

  it('reads the code from error.cause', () => {
    expect(
      isTransientNetworkError(Object.assign(new Error('x'), { cause: { code: 'UND_ERR_SOCKET' } }))
    ).toBeTruthy()
  })

  it('does NOT flag HTTP/application errors or non-objects', () => {
    expect(
      isTransientNetworkError(Object.assign(new Error('Bad Request'), { statusCode: 400 }))
    ).toBeFalsy()
    expect(isTransientNetworkError(new Error('channel points not enabled'))).toBeFalsy()
    expect(isTransientNetworkError()).toBeFalsy()
    expect(isTransientNetworkError('nope')).toBeFalsy()
  })
})

describe('retryTransient', () => {
  const transient = () => withCode('Premature close', 'ERR_STREAM_PREMATURE_CLOSE')

  it('runs fn once and returns its result on success', async () => {
    let calls = 0
    const result = await retryTransient(
      async () => {
        calls += 1
        return 'ok'
      },
      { baseDelayMs: 0 }
    )
    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0
    const result = await retryTransient(
      async () => {
        calls += 1
        if (calls < 3) {throw transient()}
        return 'ok'
      },
      { baseDelayMs: 0, retries: 2 }
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('rethrows the last error after exhausting retries', async () => {
    let calls = 0
    await expect(
      retryTransient(
        async () => {
          calls += 1
          throw transient()
        },
        { baseDelayMs: 0, retries: 2 }
      )
    ).rejects.toThrow('Premature close')
    expect(calls).toBe(3) // 1 initial + 2 retries
  })

  it('does not retry a non-transient error', async () => {
    let calls = 0
    await expect(
      retryTransient(
        async () => {
          calls += 1
          throw new Error('Bad Request')
        },
        { baseDelayMs: 0, retries: 5 }
      )
    ).rejects.toThrow('Bad Request')
    expect(calls).toBe(1)
  })
})
