import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearDisableCache,
  disableUserCache,
  isBroadcasterBeingDisabled,
  isUserBeingDisabled,
  resetState,
} from './sharedMocks.ts'

const entry = (providerAccountId: string, ageMs = 0) => ({
  timestamp: Date.now() - ageMs,
  dropReason: 'manual',
  providerAccountId,
})

beforeEach(() => resetState())

describe('isUserBeingDisabled', () => {
  it('is true for a fresh entry keyed by the user id', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    expect(isUserBeingDisabled('user-1')).toBe(true)
  })

  it('is false once the entry is older than the 30s expiry', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1', 31_000))
    expect(isUserBeingDisabled('user-1')).toBe(false)
  })

  it('is false for an unrelated user', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    expect(isUserBeingDisabled('user-2')).toBe(false)
  })
})

describe('isBroadcasterBeingDisabled', () => {
  it('matches by providerAccountId regardless of the key', () => {
    disableUserCache.set('user-1:acc-1', entry('broadcaster-9'))
    expect(isBroadcasterBeingDisabled('broadcaster-9')).toBe(true)
    expect(isBroadcasterBeingDisabled('someone-else')).toBe(false)
  })

  it('ignores expired entries', () => {
    disableUserCache.set('user-1:acc-1', entry('broadcaster-9', 31_000))
    expect(isBroadcasterBeingDisabled('broadcaster-9')).toBe(false)
  })
})

describe('clearDisableCache', () => {
  it('removes only the keys prefixed with the given user id', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    disableUserCache.set('user-1:acc-2', entry('acc-2'))
    disableUserCache.set('user-2:acc-3', entry('acc-3'))

    clearDisableCache('user-1')

    expect(disableUserCache.has('user-1:acc-1')).toBe(false)
    expect(disableUserCache.has('user-1:acc-2')).toBe(false)
    expect(disableUserCache.has('user-2:acc-3')).toBe(true)
  })
})
