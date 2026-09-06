import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPacketStub } from '../../__tests__/shared-mocks'
import type { Packet } from '../../types'
import type {
  ValidateTokenNext,
  ValidateTokenRequest,
  ValidateTokenResponse,
} from '../validate-token'

const getDBUserMock = vi.fn()
const recordGsiActivityMock = vi.fn()

vi.doMock('@dotabod/shared-utils', () => ({
  logger: { info: vi.fn() },
}))

vi.doMock(import('../../db/get-db-user'), () => ({
  default: getDBUserMock,
}))

vi.doMock(import('../setup-signals'), () => ({
  recordGsiActivity: recordGsiActivityMock,
}))

const { invalidTokens, lookingupToken, pendingCheckAuth } = await import('../lib/consts')
const { validateTokenRequest: validateToken } = await import('../validate-token')

const makeRequest = function makeRequest(token = 'token-1'): ValidateTokenRequest {
  return {
    body: {
      ...createPacketStub({ player: { activity: 'playing' } }),
      auth: { token },
    },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }
}

interface ResponseHarness {
  response: ValidateTokenResponse
  statusCalls: number[]
  jsonCalls: unknown[]
}

const makeResponse = function makeResponse(): ResponseHarness {
  const statusCalls: number[] = []
  const jsonCalls: unknown[] = []
  const response: ValidateTokenResponse = {
    json(value) {
      jsonCalls.push(value)
      return response
    },
    status(code) {
      statusCalls.push(code)
      return response
    },
  }
  return { jsonCalls, response, statusCalls }
}

interface TestClient {
  gsi?: Packet
  gsiUpdatedAt?: number
  pendingGsi?: Packet
  pendingGsiUpdatedAt?: number
  stream_online: boolean
  token: string
}

const makeClient = function makeClient(token = 'token-1', streamOnline = true): TestClient {
  return {
    stream_online: streamOnline,
    token,
  }
}

describe('validateToken cleanup', () => {
  beforeEach(() => {
    getDBUserMock.mockReset()
    recordGsiActivityMock.mockReset()
    invalidTokens.clear()
    lookingupToken.clear()
    pendingCheckAuth.clear()
  })

  it('releases pending auth after a successful online lookup and assigns GSI', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'))
    const request = makeRequest()
    const { response, jsonCalls } = makeResponse()
    const client = makeClient()
    const next = vi.fn<ValidateTokenNext>()
    getDBUserMock.mockResolvedValue({ result: client })

    await validateToken(request, response, next)

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
    const next = vi.fn<ValidateTokenNext>()
    const client = makeClient('token-1', false)
    getDBUserMock.mockResolvedValue({ result: client })

    await validateToken(request, response, next)

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

    await validateToken(request, response, vi.fn<ValidateTokenNext>())

    expect(statusCalls).toStrictEqual([200])
    expect(jsonCalls).toStrictEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBeTruthy()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })

  it('caches a rejected lookup and releases pending auth', async () => {
    const request = makeRequest()
    const { response, statusCalls, jsonCalls } = makeResponse()
    getDBUserMock.mockRejectedValue(new Error('lookup failed'))

    await validateToken(request, response, vi.fn<ValidateTokenNext>())

    expect(statusCalls).toStrictEqual([200])
    expect(jsonCalls).toStrictEqual([{ error: 'Invalid token, skipping auth check' }])
    expect(invalidTokens.has('token-1')).toBeTruthy()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })

  it('rejects a concurrent request while retaining the lock until the first lookup finishes', async () => {
    const lookupGate: { release?: () => void } = {}
    getDBUserMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        lookupGate.release = resolve
      })
      return { result: makeClient() }
    })
    const firstRequest = makeRequest()
    const firstResponse = makeResponse()
    const firstNext = vi.fn<ValidateTokenNext>()

    const firstValidation = validateToken(firstRequest, firstResponse.response, firstNext)
    expect(pendingCheckAuth.has('token-1')).toBeTruthy()

    const secondResponse = makeResponse()
    await validateToken(makeRequest(), secondResponse.response, vi.fn<ValidateTokenNext>())

    expect(getDBUserMock).toHaveBeenCalledOnce()
    expect(secondResponse.statusCalls).toStrictEqual([200])
    expect(secondResponse.jsonCalls).toStrictEqual([
      { error: 'Still validating token, skipping requests until auth' },
    ])
    expect(pendingCheckAuth.has('token-1')).toBeTruthy()

    const releaseLookup = lookupGate.release
    if (releaseLookup === undefined) {
      throw new Error('lookup did not start')
    }
    releaseLookup()
    await firstValidation

    expect(firstNext).toHaveBeenCalledOnce()
    expect(pendingCheckAuth.has('token-1')).toBeFalsy()
  })
})
