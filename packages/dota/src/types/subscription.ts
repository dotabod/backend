import type { Database } from '@dotabod/shared-utils'

export type SubscriptionRow = Pick<
  Database['public']['Tables']['subscriptions']['Row'],
  'id' | 'tier' | 'status' | 'isGift'
>

export const SUBSCRIPTION_TIERS = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const

export const isSubscriptionActive = function isSubscriptionActive(
  subscription?: SubscriptionRow
): boolean {
  // The credits need to be applied to be active
  // Dotabod creates a subscription for the gift, and the credits are immediately applied
  // But in rare cases, the subscription is not created in time, or they could not have enough
  // credits to activate immediately.
  if (subscription?.isGift === true) {
    return false
  }
  if (!subscription?.status) {
    return false
  }
  if (subscription.status === 'TRIALING') {
    return true
  }
  if (subscription.status === 'ACTIVE') {
    return true
  }
  return false
}
