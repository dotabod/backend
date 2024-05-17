import { t } from 'i18next'

import {
  DBSettings,
  type defaultSettings,
  getValueOrDefault,
  type SettingKeys,
} from '../settings.js'
import { chatClient } from '../twitch/chatClient.js'
import type { SocketClient } from '../types.js'
import { getStreamDelay } from './GSIHandler.js'

export function say(
  client: SocketClient,
  message: string,
  {
    delay = true,
    key,
    chattersKey,
    beta = false,
  }: {
    key?: SettingKeys
    chattersKey?: keyof (typeof defaultSettings)['chatters']
    delay?: boolean
    beta?: boolean
  } = {},
) {
  if (beta && !client.beta_tester) return

  // global
  const chattersEnabled = getValueOrDefault(DBSettings.chatter, client.settings)
  if (!chattersEnabled) return

  // specific 1
  const chatter = key && getValueOrDefault(key, client.settings)
  if (key && !chatter) return

  // specific 2
  const chatterSpecific = getValueOrDefault(
    DBSettings.chatters,
    client.settings,
  ) as (typeof defaultSettings)['chatters']
  if (chattersKey && !chatterSpecific[chattersKey].enabled) return

  const msg = beta ? `${message} ${t('betaFeature', { lng: client.locale })}` : message
  if (!delay) {
    chatClient.say(client.name, msg)
    return
  }

  setTimeout(() => {
    client.name && chatClient.say(client.name, msg)
  }, getStreamDelay(client.settings))
}
