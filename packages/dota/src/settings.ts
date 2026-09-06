import { settingsKeys as DBSettings, defaultSettingsStructure } from './types/settings'
import type { ChatterKeys, SettingKeys } from './types/settings'
import type { SubscriptionRow } from './types/subscription'
import { canAccessFeature } from './utils/subscription'

export { type ChatterKeys, DBSettings, type SettingKeys }

export const defaultSettings = defaultSettingsStructure

type WidenSettingValue<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? WidenSettingValue<Item>[]
        : T extends object
          ? { -readonly [Key in keyof T]: WidenSettingValue<T[Key]> }
          : T

export type SettingValue<Key extends SettingKeys> = WidenSettingValue<
  (typeof defaultSettingsStructure)[Key]
>

// Feature flag for the spectate-friend → GetRealTimeStats chain. KEEP the gated code intact —
// it's preserved on purpose pending a future bot↔streamer Steam friend-management initiative,
// not dead. See memory `keep-spectate-friend-path` for the revival plan + what to leave alone.
// Empirically (2026-05-22) `dota2.spectateFriendGame` returns no callback for non-friend streamers
// at either MMR tier; can't tell if Valve killed it or just our missing-friendship.
export const ENABLE_SPECTATE_FRIEND_GAME = false

const isPlainObject = function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const normalizeNullDefault = function normalizeNullDefault(
  key: SettingKeys,
  value: unknown
): unknown {
  if (value === null) {
    return null
  }
  if (key === 'cosmeticsAnnounce' || key === 'smokeActivated') {
    return typeof value === 'boolean' ? value : null
  }
  if (key === 'mmr' || key === 'wlStatsDays') {
    return typeof value === 'number' ? value : null
  }
  if (key === 'wlStatsStartDate') {
    return typeof value === 'string' ? value : null
  }
  return null
}

const normalizeSettingValue = function normalizeSettingValue(
  key: SettingKeys,
  value: unknown,
  defaultValue: unknown
): unknown {
  if (defaultValue === null) {
    return normalizeNullDefault(key, value)
  }
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) ? value : defaultValue
  }
  if (isPlainObject(defaultValue)) {
    return isPlainObject(value) ? { ...defaultValue, ...value } : defaultValue
  }
  return typeof value === typeof defaultValue ? value : defaultValue
}

export function getRawSettingValue<Key extends SettingKeys>(
  key: Key,
  data?: { key: string; value: unknown }[]
): SettingValue<Key>
export function getRawSettingValue(
  key: SettingKeys,
  data?: { key: string; value: unknown }[]
): unknown {
  // Rest of existing logic for handling settings
  if (!Array.isArray(data) || !data.length || !data.filter(Boolean).length) {
    return defaultSettings[key]
  }

  const dbVal = data.find((s) => s.key === key)?.value
  const defaultValue = defaultSettings[key]

  // Undefined is not touching the option in FE yet
  // So we give them our best default
  if (dbVal === undefined) {
    return defaultValue
  }

  if (typeof dbVal !== 'string') {
    return normalizeSettingValue(key, dbVal, defaultValue)
  }

  try {
    const parsed: unknown = JSON.parse(dbVal)
    return normalizeSettingValue(key, parsed, defaultValue)
  } catch {
    return normalizeSettingValue(key, dbVal, defaultValue)
  }
}

export function getValueOrDefault<Key extends SettingKeys>(
  key: Key,
  data?: { key: string; value: unknown }[],
  subscription?: SubscriptionRow,
  chatterKey?: ChatterKeys
): SettingValue<Key>
export function getValueOrDefault(
  key: SettingKeys,
  data?: { key: string; value: unknown }[],
  subscription?: SubscriptionRow,
  chatterKey?: ChatterKeys
): unknown {
  // Check subscription access
  const featureKey = chatterKey ? (`chatters.${chatterKey}` as const) : key
  const { hasAccess } = canAccessFeature(featureKey, subscription)
  if (!hasAccess) {
    const defaultValue = defaultSettings[key]
    // For boolean settings, return false if no access
    if (typeof defaultValue === 'boolean') {
      return false
    }
    // For chatters object, return with disabled state
    if (key === 'chatters' && chatterKey) {
      return {
        ...defaultSettings.chatters,
        [chatterKey]: { enabled: false },
      }
    }
    // For objects (like betsInfo), return default with disabled state
    if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
      return {
        ...(defaultValue as Record<string, unknown>),
        enabled: false,
      }
    }
    // For other types, return default value
    return defaultValue
  }

  return getRawSettingValue(key, data)
}
