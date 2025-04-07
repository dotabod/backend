import { getValueOrDefault } from '../settings.js'
import type { SocketClient } from '../types.js'
import { settingsKeys as DBSettings } from '../types/settings.js'
import type { SubscriptionRow } from '../types/subscription.js'
import { GLOBAL_DELAY } from './lib/consts.js'

export function getStreamDelay(settings: SocketClient['settings'], subscription?: SubscriptionRow) {
  return Number(getValueOrDefault(DBSettings.streamDelay, settings, subscription)) + GLOBAL_DELAY
}
