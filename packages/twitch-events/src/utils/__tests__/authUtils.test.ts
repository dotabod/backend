import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import type { Request } from 'express'
import { isAuthenticated } from '../authUtils.ts'

const makeReq = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as Request

describe('isAuthenticated', () => {
  const original = process.env.TWITCH_EVENTSUB_SECRET

  beforeEach(() => {
    process.env.TWITCH_EVENTSUB_SECRET = 'expected-secret'
  })

  afterEach(() => {
    if (original === undefined) delete process.env.TWITCH_EVENTSUB_SECRET
    else process.env.TWITCH_EVENTSUB_SECRET = original
  })

  it('returns true when the authorization header matches the secret', () => {
    expect(isAuthenticated(makeReq('expected-secret'))).toBe(true)
  })

  it('returns false when the authorization header does not match', () => {
    expect(isAuthenticated(makeReq('wrong-secret'))).toBe(false)
  })

  it('returns false when the authorization header is missing', () => {
    expect(isAuthenticated(makeReq())).toBe(false)
  })
})
