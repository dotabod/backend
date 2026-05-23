import { describe, expect, it } from 'vite-plus/test'
import type { SubscriptionRow } from '../../types/subscription.ts'
import {
  canAccessFeature,
  getRequiredTier,
  isChatterKey,
  isInGracePeriod,
} from '../subscription.ts'

const sub = (overrides: Partial<SubscriptionRow>): SubscriptionRow =>
  ({ id: 's1', tier: 'PRO', status: 'ACTIVE', isGift: false, ...overrides }) as SubscriptionRow

describe('getRequiredTier', () => {
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
    expect(getRequiredTier('not-a-real-feature' as any)).toBe('PRO')
  })
})

describe('isChatterKey', () => {
  it('is true for chatters.* keys', () => {
    expect(isChatterKey('chatters.midas')).toBe(true)
  })

  it('is false for non-chatter keys', () => {
    expect(isChatterKey('mmr')).toBe(false)
  })
})

describe('isInGracePeriod', () => {
  it('is over (grace period ended 2025-04-30)', () => {
    expect(isInGracePeriod()).toBe(false)
  })
})

describe('canAccessFeature', () => {
  it('grants free features regardless of subscription', () => {
    expect(canAccessFeature('mmr', null)).toEqual({ hasAccess: true, requiredTier: 'FREE' })
  })

  it('denies pro features without a subscription', () => {
    expect(canAccessFeature('bets', null)).toEqual({ hasAccess: false, requiredTier: 'PRO' })
  })

  it('grants a pro feature to an active PRO subscriber', () => {
    expect(canAccessFeature('bets', sub({ tier: 'PRO', status: 'ACTIVE' }))).toEqual({
      hasAccess: true,
      requiredTier: 'PRO',
    })
  })

  it('grants a pro feature to a TRIALING PRO subscriber', () => {
    expect(canAccessFeature('bets', sub({ tier: 'PRO', status: 'TRIALING' })).hasAccess).toBe(true)
  })

  it('denies a pro feature to a FREE-tier subscriber', () => {
    expect(canAccessFeature('bets', sub({ tier: 'FREE', status: 'ACTIVE' })).hasAccess).toBe(false)
  })

  it('denies a pro feature when the subscription is a gift (not yet active)', () => {
    expect(canAccessFeature('bets', sub({ tier: 'PRO', isGift: true })).hasAccess).toBe(false)
  })

  it('denies a pro feature when the subscription is canceled', () => {
    expect(
      canAccessFeature('bets', sub({ tier: 'PRO', status: 'CANCELED' as any })).hasAccess,
    ).toBe(false)
  })
})
