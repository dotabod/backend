import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const getDBUserMock = vi.fn()
const recordGsiFirstSeenMock = vi.fn()

vi.doMock('@dotabod/shared-utils', () => ({
  logger: { info: vi.fn() },
}))

vi.doMock('../../db/getDBUser', () => ({
  default: getDBUserMock,
}))

vi.doMock('../setupSignals', () => ({
  recordGsiFirstSeen: recordGsiFirstSeenMock,
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
    status(code: number) {
      statusCalls.push(code)
      return response
    },
    json(value: unknown) {
      jsonCalls.push(value)
      return response
    },
  } as Response
  return { response, statusCalls, jsonCalls }
}

function makeClient(token = 'token-1', streamOnline = true) {
  return { token, stream_online: streamOnline, gsi: undefined }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  getDBUserMock.mockReset()
  recordGsiFirstSeenMock.mockReset()
  invalidTokens.clear()
  lookingupToken.clear()
  pendingCheckAuth.clear()
})

describe('validateToken cleanup', () => {
  it('releases pending auth after a successful online lookup and assigns GSI', async () => {
    const request = makeRequest()
    const { response, jsonCalls } = makeResponse()
    const client = makeClient()
    const next = vi.fn()
    getDBUserMock.mockResolvedValue({ result: client })

    await validateToken(request, response, next as NextFunction)

    expect(client.gsi).toBe(request.body)
    expect(recordGsiFirstSeenMock).toHaveBeenCalledWith('token-1')
    expect(next).toHaveBeenCalledOnce()
    expect(jsonCalls).toEqual([])
    expect(pendingCheckAuth.has('token-1')).toBe(false)
  })

  it('releases pending auth after an offline lookup while preserving the HTTP 200 response', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    const next = vi.fn()
    getDBUserMock.mockResolvedValue({ result: makeClient('token-1', false) })

    await validateToken(request, response, next as NextFunction)

    expect(statusCalls).toEqual([200])
    expect(jsonCalls).toEqual([{ error: 'Stream offline' }])
    expect(next).not.toHaveBeenCalled()
    expect(pendingCheckAuth.has('token-1')).toBe(false)
  })

  it('caches an invalid lookup and releases pending auth', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    getDBUserMock.mockResolvedValue({ result: null })

    await validateToken(request, response, vi.fn() as NextFunction)

    expect(statusCalls).toEqual([200])
    expect(jsonCalls).toEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBe(true)
    expect(pendingCheckAuth.has('token-1')).toBe(false)
  })

  it('caches a rejected lookup and releases pending auth', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    getDBUserMock.mockRejectedValue(new Error('lookup failed'))

    await validateToken(request, response, vi.fn() as NextFunction)

    expect(statusCalls).toEqual([200])
    expect(jsonCalls).toEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBe(true)
    expect(pendingCheckAuth.has('token-1')).toBe(false)
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
      firstNext as NextFunction,
    )
    expect(pendingCheckAuth.has('token-1')).toBe(true)

    const secondResponse = makeResponse()
    await validateToken(makeRequest(), secondResponse.response, vi.fn() as NextFunction)

    expect(getDBUserMock).toHaveBeenCalledOnce()
    expect(secondResponse.statusCalls).toEqual([200])
    expect(secondResponse.jsonCalls).toEqual([
      { error: 'Still validating token, skipping requests until auth' },
    ])
    expect(pendingCheckAuth.has('token-1')).toBe(true)

    lookup.resolve({ result: makeClient() })
    await firstValidation

    expect(firstNext).toHaveBeenCalledOnce()
    expect(pendingCheckAuth.has('token-1')).toBe(false)
  })
})
