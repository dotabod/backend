import type { Database } from '@dotabod/shared-utils'
import type { ChatterSettingKeys, SettingKeys } from '../types/settings.js'
import {
  isSubscriptionActive,
  SUBSCRIPTION_TIERS,
  type SubscriptionRow,
} from '../types/subscription.js'

export const TIER_LEVELS: Record<Database['public']['Enums']['SubscriptionTier'], number> = {
  [SUBSCRIPTION_TIERS.FREE]: 0,
  [SUBSCRIPTION_TIERS.PRO]: 1,
}

export const PRICE_PERIODS = {
  MONTHLY: 'monthly',
  ANNUAL: 'annual',
  LIFETIME: 'lifetime',
} as const

export type PricePeriod = (typeof PRICE_PERIODS)[keyof typeof PRICE_PERIODS]

export const FEATURE_TIERS: Record<
  SettingKeys | ChatterSettingKeys,
  Database['public']['Enums']['SubscriptionTier']
> = {
  advancedBets: SUBSCRIPTION_TIERS.PRO,
  discardZeroBets: SUBSCRIPTION_TIERS.PRO,
  // Free Tier Features
  'minimap-blocker': SUBSCRIPTION_TIERS.FREE,
  chatter: SUBSCRIPTION_TIERS.FREE,
  'only-block-ranked': SUBSCRIPTION_TIERS.PRO,
  commandCommands: SUBSCRIPTION_TIERS.FREE,
  commandMmr: SUBSCRIPTION_TIERS.FREE,
  commandDisable: SUBSCRIPTION_TIERS.FREE,
  mmr: SUBSCRIPTION_TIERS.FREE,
  chatters: SUBSCRIPTION_TIERS.FREE,
  commandFixparty: SUBSCRIPTION_TIERS.FREE,
  commandRefresh: SUBSCRIPTION_TIERS.FREE,
  commandGeo: SUBSCRIPTION_TIERS.PRO,
  commandSetmmr: SUBSCRIPTION_TIERS.FREE,
  commandBeta: SUBSCRIPTION_TIERS.FREE,
  commandMute: SUBSCRIPTION_TIERS.FREE,
  commandPing: SUBSCRIPTION_TIERS.FREE,
  commandDotabod: SUBSCRIPTION_TIERS.FREE,
  'mmr-tracker': SUBSCRIPTION_TIERS.FREE,

  commandWon: SUBSCRIPTION_TIERS.FREE,
  commandLost: SUBSCRIPTION_TIERS.FREE,

  commandOnly: SUBSCRIPTION_TIERS.PRO,
  rankOnly: SUBSCRIPTION_TIERS.PRO,

  commandLastFm: SUBSCRIPTION_TIERS.PRO,
  lastFmUsername: SUBSCRIPTION_TIERS.PRO,
  lastFmOverlay: SUBSCRIPTION_TIERS.PRO,

  // Pro Tier Features
  bets: SUBSCRIPTION_TIERS.PRO,
  'picks-blocker': SUBSCRIPTION_TIERS.PRO,
  rosh: SUBSCRIPTION_TIERS.PRO,
  commandDelay: SUBSCRIPTION_TIERS.PRO,
  commandOnline: SUBSCRIPTION_TIERS.FREE,
  commandWL: SUBSCRIPTION_TIERS.FREE,
  commandRanked: SUBSCRIPTION_TIERS.FREE,
  commandRosh: SUBSCRIPTION_TIERS.PRO,
  'chatters.midas': SUBSCRIPTION_TIERS.PRO,
  'chatters.pause': SUBSCRIPTION_TIERS.FREE,
  'chatters.smoke': SUBSCRIPTION_TIERS.FREE,
  'chatters.passiveDeath': SUBSCRIPTION_TIERS.PRO,
  'chatters.roshPickup': SUBSCRIPTION_TIERS.PRO,
  'chatters.roshDeny': SUBSCRIPTION_TIERS.PRO,
  'chatters.roshanKilled': SUBSCRIPTION_TIERS.PRO,
  'chatters.tip': SUBSCRIPTION_TIERS.FREE,
  'chatters.bounties': SUBSCRIPTION_TIERS.FREE,
  'chatters.powerTreads': SUBSCRIPTION_TIERS.PRO,
  'chatters.killstreak': SUBSCRIPTION_TIERS.FREE,
  'chatters.firstBloodDeath': SUBSCRIPTION_TIERS.PRO,
  'chatters.noTp': SUBSCRIPTION_TIERS.FREE,
  'chatters.matchOutcome': SUBSCRIPTION_TIERS.FREE,
  'chatters.commandsReady': SUBSCRIPTION_TIERS.FREE,
  'chatters.neutralItems': SUBSCRIPTION_TIERS.PRO,
  'chatters.dotapatch': SUBSCRIPTION_TIERS.FREE,
  'chatters.chattingSpamEmote': SUBSCRIPTION_TIERS.FREE,
  aegis: SUBSCRIPTION_TIERS.PRO,
  betsInfo: SUBSCRIPTION_TIERS.PRO,
  customMmr: SUBSCRIPTION_TIERS.PRO,
  tellChatNewMMR: SUBSCRIPTION_TIERS.FREE,
  tellChatBets: SUBSCRIPTION_TIERS.PRO,
  'obs-scene-switcher': SUBSCRIPTION_TIERS.PRO,
  streamDelay: SUBSCRIPTION_TIERS.PRO,
  livePolls: SUBSCRIPTION_TIERS.PRO,
  'minimap-simple': SUBSCRIPTION_TIERS.PRO,
  'minimap-xl': SUBSCRIPTION_TIERS.FREE,
  notablePlayersOverlay: SUBSCRIPTION_TIERS.PRO,
  notablePlayersOverlayFlags: SUBSCRIPTION_TIERS.PRO,
  notablePlayersOverlayFlagsCmd: SUBSCRIPTION_TIERS.PRO,
  winProbabilityOverlay: SUBSCRIPTION_TIERS.PRO,
  queueBlocker: SUBSCRIPTION_TIERS.PRO,
  queueBlockerFindMatch: SUBSCRIPTION_TIERS.PRO,
  commandSpectators: SUBSCRIPTION_TIERS.FREE,
  commandFacet: SUBSCRIPTION_TIERS.FREE,
  commandInnate: SUBSCRIPTION_TIERS.FREE,
  commandShard: SUBSCRIPTION_TIERS.FREE,
  commandAghs: SUBSCRIPTION_TIERS.FREE,
  commandWinProbability: SUBSCRIPTION_TIERS.PRO,
  commandAPM: SUBSCRIPTION_TIERS.FREE,
  commandAvg: SUBSCRIPTION_TIERS.FREE,
  commandDotabuff: SUBSCRIPTION_TIERS.FREE,
  commandGM: SUBSCRIPTION_TIERS.PRO,
  commandGPM: SUBSCRIPTION_TIERS.FREE,
  commandHero: SUBSCRIPTION_TIERS.PRO,
  commandLG: SUBSCRIPTION_TIERS.PRO,
  commandModsonly: SUBSCRIPTION_TIERS.FREE,
  commandNP: SUBSCRIPTION_TIERS.PRO,
  commandOpendota: SUBSCRIPTION_TIERS.FREE,
  commandPleb: SUBSCRIPTION_TIERS.FREE,
  commandSmurfs: SUBSCRIPTION_TIERS.PRO,
  commandProfile: SUBSCRIPTION_TIERS.PRO,
  commandLGS: SUBSCRIPTION_TIERS.FREE,
  commandSteam: SUBSCRIPTION_TIERS.FREE,
  commandXPM: SUBSCRIPTION_TIERS.FREE,
  commandBuilds: SUBSCRIPTION_TIERS.FREE,
  commandItems: SUBSCRIPTION_TIERS.PRO,
  commandVersion: SUBSCRIPTION_TIERS.FREE,
  commandResetwl: SUBSCRIPTION_TIERS.FREE,
  commandLocale: SUBSCRIPTION_TIERS.FREE,
  showRankMmr: SUBSCRIPTION_TIERS.FREE,
  showRankImage: SUBSCRIPTION_TIERS.FREE,
  showRankLeader: SUBSCRIPTION_TIERS.FREE,
  obsServerPassword: SUBSCRIPTION_TIERS.PRO,
  obsServerPort: SUBSCRIPTION_TIERS.PRO,
  battlepass: SUBSCRIPTION_TIERS.PRO,
  minimapRight: SUBSCRIPTION_TIERS.PRO,
  autoTranslate: SUBSCRIPTION_TIERS.PRO,
  translationLanguage: SUBSCRIPTION_TIERS.PRO,
  onlyParty: SUBSCRIPTION_TIERS.PRO,
  'obs-dc': SUBSCRIPTION_TIERS.PRO,
  'obs-minimap': SUBSCRIPTION_TIERS.PRO,
  'obs-picks': SUBSCRIPTION_TIERS.PRO,
  queueBlockerFindMatchText: SUBSCRIPTION_TIERS.PRO,
  winProbabilityOverlayIntervalMinutes: SUBSCRIPTION_TIERS.PRO,
  'minimap-opacity': SUBSCRIPTION_TIERS.PRO,
  showGiftAlerts: SUBSCRIPTION_TIERS.FREE,
  lastFmRefreshRate: SUBSCRIPTION_TIERS.PRO,
  disableAutoClipping: SUBSCRIPTION_TIERS.FREE,
  crypto_payment_interest: SUBSCRIPTION_TIERS.FREE,
  translateOnOverlay: SUBSCRIPTION_TIERS.PRO,
  autoCommandsOnMatchStart: SUBSCRIPTION_TIERS.PRO,
} as const

export type FeatureTier = keyof typeof FEATURE_TIERS

// Add new mapping for generic features
export const GENERIC_FEATURE_TIERS = {
  managers: SUBSCRIPTION_TIERS.PRO,
  autoOBS: SUBSCRIPTION_TIERS.PRO,
  autoInstaller: SUBSCRIPTION_TIERS.PRO,
  autoModerator: SUBSCRIPTION_TIERS.PRO,
  auto7TV: SUBSCRIPTION_TIERS.PRO,
} as const

export type GenericFeature = keyof typeof GENERIC_FEATURE_TIERS

export function getRequiredTier(
  feature?: FeatureTier | GenericFeature,
): Database['public']['Enums']['SubscriptionTier'] {
  if (!feature) return SUBSCRIPTION_TIERS.PRO

  return (
    FEATURE_TIERS[feature as FeatureTier] ||
    GENERIC_FEATURE_TIERS[feature as GenericFeature] ||
    SUBSCRIPTION_TIERS.PRO
  )
}

// Add helper to check if a key is a chatter key
export function isChatterKey(key: string): boolean {
  return key.startsWith('chatters.')
}

export const GRACE_PERIOD_END = new Date('2025-04-30T23:59:59.999Z')

// Add a function to check if we're in the grace period
export function isInGracePeriod(): boolean {
  return new Date() < GRACE_PERIOD_END
}

// Update canAccessFeature to handle chatter keys
export function canAccessFeature(
  feature: FeatureTier | GenericFeature,
  subscription: SubscriptionRow | null | undefined,
): { hasAccess: boolean; requiredTier: Database['public']['Enums']['SubscriptionTier'] } {
  const requiredTier = getRequiredTier(feature)
  const isFreeFeature = requiredTier === SUBSCRIPTION_TIERS.FREE

  // Check if we're in the grace period (before April 30, 2025)
  // Grant Pro access to all users during this period
  if (isInGracePeriod()) {
    return {
      hasAccess: true, // All features are accessible during grace period
      requiredTier,
    }
  }

  if (isFreeFeature) {
    return {
      hasAccess: true,
      requiredTier,
    }
  }

  if (!subscription?.tier)
    return {
      hasAccess: false,
      requiredTier: requiredTier,
    }

  // Return early if feature is free or subscription is invalid
  if (isFreeFeature || !subscription || !isSubscriptionActive(subscription)) {
    return {
      hasAccess: isFreeFeature,
      requiredTier,
    }
  }

  // Check if subscription tier level meets required tier level
  return {
    hasAccess: TIER_LEVELS[subscription.tier] >= TIER_LEVELS[requiredTier],
    requiredTier,
  }
}
