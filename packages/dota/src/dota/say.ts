import { t } from 'i18next'

import {
  DBSettings,
  type SettingKeys,
  type defaultSettings,
  getValueOrDefault,
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

  // Check global chatter access
  const chattersEnabled = getValueOrDefault(
    DBSettings.chatter,
    client.settings,
    client.subscription,
  )
  if (!chattersEnabled) return

  // Check specific feature access
  if (key && !getValueOrDefault(key, client.settings, client.subscription)) return

  // Check specific chatter access
  if (chattersKey) {
    const chatterSpecific = getValueOrDefault(
      DBSettings.chatters,
      client.settings,
      client.subscription,
      chattersKey,
    ) as (typeof defaultSettings)['chatters']
    if (!chatterSpecific[chattersKey].enabled) return
  }

  const msg = beta ? `${message} ${t('betaFeature', { lng: client.locale })}` : message
  if (!delay) {
    chatClient.say(client.name, msg)
    return
  }

  setTimeout(() => {
    client.name && chatClient.say(client.name, msg)
  }, getStreamDelay(client.settings))
}
