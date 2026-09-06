import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDBUserMock = vi.fn()
const recordGsiActivityMock = vi.fn()

vi.doMock(import('@dotabod/shared-utils'), () => ({
  logger: { info: vi.fn() },
}))

vi.doMock(import('../../db/getDBUser'), () => ({
  default: getDBUserMock,
}))

vi.doMock(import('../setupSignals'), () => ({
  recordGsiActivity: recordGsiActivityMock,
}))

const { invalidTokens, lookingupToken, pendingCheckAuth } = await import('../lib/consts')
const { validateToken } = await import('../validateToken')

function makeRequest(token = 'token-1'): Request {
  return {
    body: { auth: { token }, player: { activity: 'playing' } },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as Request
}

function makeResponse(): {
  response: Response
  statusCalls: number[]
  jsonCalls: unknown[]
} {
  const statusCalls: number[] = []
  const jsonCalls: unknown[] = []
  const response = {
    json(value: unknown) {
      jsonCalls.push(value)
      return response
    },
    status(code: number) {
      statusCalls.push(code)
      return response
    },
  } as Response
  return { jsonCalls, response, statusCalls }
}

function makeClient(token = 'token-1', streamOnline = true) {
  return {
    gsi: undefined,
    gsiUpdatedAt: undefined as number | undefined,
    pendingGsi: undefined,
    pendingGsiUpdatedAt: undefined as number | undefined,
    stream_online: streamOnline,
    token,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

beforeEach(() => {
  getDBUserMock.mockReset()
  recordGsiActivityMock.mockReset()
  invalidTokens.clear()
  lookingupToken.clear()
  pendingCheckAuth.clear()
})

describe('validateToken cleanup', () => {
  it('releases pending auth after a successful online lookup and assigns GSI', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'))
    const request = makeRequest()
    const { response, jsonCalls } = makeResponse()
    const client = makeClient()
    const next = vi.fn()
    getDBUserMock.mockResolvedValue({ result: client })

    await validateToken(request, response, next as NextFunction)

    expect(client.gsi).toBe(request.body)
    expect(client.gsiUpdatedAt).toBe(Date.now())
    expect(client.pendingGsi).toBeUndefined()
    expect(client.pendingGsiUpdatedAt).toBeUndefined()
    expect(recordGsiActivityMock).toHaveBeenCalledWith('token-1')
    expect(next).toHaveBeenCalledOnce()
    expect(jsonCalls).toStrictEqual([])
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
    vi.useRealTimers()
  })

  it('caches the latest GSI while offline without dispatching game events', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'))
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    const next = vi.fn()
    const client = makeClient('token-1', false)
    getDBUserMock.mockResolvedValue({ result: client })

    await validateToken(request, response, next as NextFunction)

    expect(statusCalls).toStrictEqual([200])
    expect(jsonCalls).toStrictEqual([{ error: 'Stream offline' }])
    expect(client.pendingGsi).toBe(request.body)
    expect(client.pendingGsiUpdatedAt).toBe(Date.now())
    expect(client.gsi).toBeUndefined()
    expect(client.gsiUpdatedAt).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
    vi.useRealTimers()
  })

  it('caches an invalid lookup and releases pending auth', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    getDBUserMock.mockResolvedValue({ result: null })

    await validateToken(request, response, vi.fn() as NextFunction)

    expect(statusCalls).toStrictEqual([200])
    expect(jsonCalls).toStrictEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBeTruthy()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })

  it('caches a rejected lookup and releases pending auth', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    getDBUserMock.mockRejectedValue(new Error('lookup failed'))

    await validateToken(request, response, vi.fn() as NextFunction)

    expect(statusCalls).toStrictEqual([200])
    expect(jsonCalls).toStrictEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBeTruthy()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })

  it('rejects a concurrent request while retaining the lock until the first lookup finishes', async () => {
    const lookup = deferred<{ result: ReturnType<typeof makeClient> }>()
    getDBUserMock.mockReturnValue(lookup.promise)
    const firstRequest = makeRequest()
    const firstResponse = makeResponse()
    const firstNext = vi.fn()

    const firstValidation = validateToken(
      firstRequest,
      firstResponse.response,
      firstNext as NextFunction
    )
    expect(pendingCheckAuth.has('token-1')).toBeTruthy()

    const secondResponse = makeResponse()
    await validateToken(makeRequest(), secondResponse.response, vi.fn() as NextFunction)

    expect(getDBUserMock).toHaveBeenCalledOnce()
    expect(secondResponse.statusCalls).toStrictEqual([200])
    expect(secondResponse.jsonCalls).toStrictEqual([
      { error: 'Still validating token, skipping requests until auth' },
    ])
    expect(pendingCheckAuth.has('token-1')).toBeTruthy()

    lookup.resolve({ result: makeClient() })
    await firstValidation

    expect(firstNext).toHaveBeenCalledOnce()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })
})
