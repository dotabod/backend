import { getValueOrDefault } from '../settings'
import type { SocketClient } from '../types'
import { settingsKeys as DBSettings } from '../types/settings'
import type { SubscriptionRow } from '../types/subscription'
import { GLOBAL_DELAY } from './lib/consts'

export const getStreamDelay = function getStreamDelay(
  settings: SocketClient['settings'],
  subscription?: SubscriptionRow
) {
  return getValueOrDefault(DBSettings.streamDelay, settings, subscription) + GLOBAL_DELAY
}
