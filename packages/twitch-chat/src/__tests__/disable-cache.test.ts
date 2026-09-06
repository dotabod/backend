import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearDisableCache,
  disableUserCache,
  isBroadcasterBeingDisabled,
  isUserBeingDisabled,
  resetState,
} from './shared-mocks.ts'

const entry = (providerAccountId: string, ageMs = 0) => ({
  dropReason: 'manual',
  providerAccountId,
  timestamp: Date.now() - ageMs,
})

beforeEach(() => {
  resetState()
})

describe(isUserBeingDisabled, () => {
  it('is true for a fresh entry keyed by the user id', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    expect(isUserBeingDisabled('user-1')).toBeTruthy()
  })

  it('is false once the entry is older than the 30s expiry', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1', 31_000))
    expect(isUserBeingDisabled('user-1')).toBeFalsy()
  })

  it('is false for an unrelated user', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    expect(isUserBeingDisabled('user-2')).toBeFalsy()
  })
})

describe(isBroadcasterBeingDisabled, () => {
  it('matches by providerAccountId regardless of the key', () => {
    disableUserCache.set('user-1:acc-1', entry('broadcaster-9'))
    expect(isBroadcasterBeingDisabled('broadcaster-9')).toBeTruthy()
    expect(isBroadcasterBeingDisabled('someone-else')).toBeFalsy()
  })

  it('ignores expired entries', () => {
    disableUserCache.set('user-1:acc-1', entry('broadcaster-9', 31_000))
    expect(isBroadcasterBeingDisabled('broadcaster-9')).toBeFalsy()
  })
})

describe(clearDisableCache, () => {
  it('removes only the keys prefixed with the given user id', () => {
    disableUserCache.set('user-1:acc-1', entry('acc-1'))
    disableUserCache.set('user-1:acc-2', entry('acc-2'))
    disableUserCache.set('user-2:acc-3', entry('acc-3'))

    clearDisableCache('user-1')

    expect(disableUserCache.has('user-1:acc-1')).toBeFalsy()
    expect(disableUserCache.has('user-1:acc-2')).toBeFalsy()
    expect(disableUserCache.has('user-2:acc-3')).toBeTruthy()
  })
})
