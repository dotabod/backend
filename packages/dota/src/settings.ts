import {
  type ChatterKeys,
  type CommandKeys,
  settingsKeys as DBSettings,
  type SettingKeys,
  defaultCommands,
  defaultSettingsStructure,
} from './types/settings.js'
import type { SubscriptionRow } from './types/subscription.js'
import { canAccessFeature } from './utils/subscription.js'

export { DBSettings, type SettingKeys, type CommandKeys, type ChatterKeys }

export const commands = defaultCommands
export const defaultSettings = defaultSettingsStructure

export const getRawSettingValue = (
  key: SettingKeys,
  data?: { key: string; value: any }[],
) => {
  // Rest of existing logic for handling settings
  if (!Array.isArray(data) || !data.length || !data.filter(Boolean).length) {
    return defaultSettings[key]
  }

  const dbVal = data.find((s) => s.key === key)?.value

  // Undefined is not touching the option in FE yet
  // So we give them our best default
  if (dbVal === undefined) {
    return defaultSettings[key]
  }

  try {
    if (typeof dbVal === 'string') {
      const val = JSON.parse(dbVal) as unknown as any
      if (typeof val === 'object' && typeof defaultSettings[key] === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return {
          ...(defaultSettings[key] as any),
          ...val,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return val
    }

    if (typeof dbVal === 'object' && typeof defaultSettings[key] === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        ...(defaultSettings[key] as any),
        ...dbVal,
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbVal
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbVal
  }
}

export const getValueOrDefault = (
  key: SettingKeys,
  data?: { key: string; value: any }[],
  subscription?: SubscriptionRow,
  chatterKey?: ChatterKeys,
) => {
  // Check subscription access
  const featureKey = chatterKey ? (`chatters.${chatterKey}` as const) : key
  const { hasAccess } = canAccessFeature(featureKey, subscription)
  if (!hasAccess) {
    // For boolean settings, return false if no access
    if (typeof defaultSettings[key] === 'boolean') {
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
    if (typeof defaultSettings[key] === 'object') {
      return {
        ...(defaultSettings[key] as any),
        enabled: false,
      }
    }
    // For other types, return default value
    return defaultSettings[key]
  }

  return getRawSettingValue(key, data)
}
