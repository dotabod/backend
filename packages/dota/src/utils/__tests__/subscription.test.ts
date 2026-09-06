import { describe, expect, it } from 'vitest'

import type { SubscriptionRow } from '../../types/subscription.ts'
import {
  canAccessFeature,
  getRequiredTier,
  isChatterKey,
  isInGracePeriod,
} from '../subscription.ts'

const sub = (overrides: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: 's1',
  isGift: false,
  status: 'ACTIVE',
  tier: 'PRO',
  ...overrides,
})

describe(getRequiredTier, () => {
  it('defaults to PRO when no feature is given', () => {
    expect(getRequiredTier()).toBe('PRO')
  })

  it('returns FREE for a free feature', () => {
    expect(getRequiredTier('mmr')).toBe('FREE')
  })

  it('returns PRO for a pro feature', () => {
    expect(getRequiredTier('bets')).toBe('PRO')
  })

  it('resolves generic features', () => {
    expect(getRequiredTier('managers')).toBe('PRO')
  })

  it('falls back to PRO for an unknown feature', () => {
    expect(getRequiredTier('not-a-real-feature')).toBe('PRO')
  })
})

describe(isChatterKey, () => {
  it('is true for chatters.* keys', () => {
    expect(isChatterKey('chatters.midas')).toBeTruthy()
  })

  it('is false for non-chatter keys', () => {
    expect(isChatterKey('mmr')).toBeFalsy()
  })
})

describe(isInGracePeriod, () => {
  it('is over (grace period ended 2025-04-30)', () => {
    expect(isInGracePeriod()).toBeFalsy()
  })
})

describe(canAccessFeature, () => {
  it('grants free features regardless of subscription', () => {
    expect(canAccessFeature('mmr', null)).toStrictEqual({ hasAccess: true, requiredTier: 'FREE' })
  })

  it('denies pro features without a subscription', () => {
    expect(canAccessFeature('bets', null)).toStrictEqual({ hasAccess: false, requiredTier: 'PRO' })
  })

  it('grants a pro feature to an active PRO subscriber', () => {
    expect(canAccessFeature('bets', sub({ status: 'ACTIVE', tier: 'PRO' }))).toStrictEqual({
      hasAccess: true,
      requiredTier: 'PRO',
    })
  })

  it('grants a pro feature to a TRIALING PRO subscriber', () => {
    expect(
      canAccessFeature('bets', sub({ status: 'TRIALING', tier: 'PRO' })).hasAccess
    ).toBeTruthy()
  })

  it('denies a pro feature to a FREE-tier subscriber', () => {
    expect(canAccessFeature('bets', sub({ status: 'ACTIVE', tier: 'FREE' })).hasAccess).toBeFalsy()
  })

  it('denies a pro feature when the subscription is a gift (not yet active)', () => {
    expect(canAccessFeature('bets', sub({ isGift: true, tier: 'PRO' })).hasAccess).toBeFalsy()
  })

  it('denies a pro feature when the subscription is canceled', () => {
    expect(canAccessFeature('bets', sub({ status: 'CANCELED', tier: 'PRO' })).hasAccess).toBeFalsy()
  })
})
