import type { Database } from '../db/supabase-types.js'

export type SubscriptionRow = Pick<
  Database['public']['Tables']['subscriptions']['Row'],
  'id' | 'tier' | 'status' | 'isGift'
>

export const SUBSCRIPTION_TIERS = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const

export function isSubscriptionActive(subscription?: SubscriptionRow): boolean {
  if (subscription?.isGift) return false
  if (!subscription?.status) return false
  if (subscription.status === 'TRIALING') return true
  if (subscription.status === 'ACTIVE') return true
  return false
}
