import {
  type ChatterKeys,
  type CommandKeys,
  settingsKeys as DBSettings,
  defaultCommands,
  defaultSettingsStructure,
  type SettingKeys,
} from './types/settings'
import type { SubscriptionRow } from './types/subscription'
import { canAccessFeature } from './utils/subscription'

export { type ChatterKeys, type CommandKeys, DBSettings, type SettingKeys }

export const commands = defaultCommands
export const defaultSettings = defaultSettingsStructure

// Feature flag for the spectate-friend → GetRealTimeStats chain. KEEP the gated code intact —
// it's preserved on purpose pending a future bot↔streamer Steam friend-management initiative,
// not dead. See memory `keep-spectate-friend-path` for the revival plan + what to leave alone.
// Empirically (2026-05-22) `dota2.spectateFriendGame` returns no callback for non-friend streamers
// at either MMR tier; can't tell if Valve killed it or just our missing-friendship.
export const ENABLE_SPECTATE_FRIEND_GAME = false

export const getRawSettingValue = (key: SettingKeys, data?: { key: string; value: unknown }[]) => {
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

  try {
    if (typeof dbVal === 'string') {
      const val = JSON.parse(dbVal)
      if (typeof val === 'object' && typeof defaultValue === 'object') {
        return {
          ...defaultValue,
          ...val,
        }
      }

      return val
    }

    if (typeof dbVal === 'object' && typeof defaultValue === 'object') {
      return {
        ...defaultValue,
        ...dbVal,
      }
    }

    return dbVal
  } catch {
    return dbVal
  }
}

export const getValueOrDefault = (
  key: SettingKeys,
  data?: { key: string; value: unknown }[],
  subscription?: SubscriptionRow,
  chatterKey?: ChatterKeys,
) => {
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
    if (typeof defaultValue === 'object') {
      return {
        ...defaultValue,
        enabled: false,
      }
    }
    // For other types, return default value
    return defaultValue
  }

  return getRawSettingValue(key, data)
}
