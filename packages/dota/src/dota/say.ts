import { t } from 'i18next'

import {
  DBSettings,
  type defaultSettings,
  getValueOrDefault,
  type SettingKeys,
} from '../settings.js'
import { chatClient } from '../twitch/chatClient.js'
import type { SocketClient } from '../types.js'
import { getStreamDelay } from './getStreamDelay.js'
import { delayedQueue } from './lib/DelayedQueue.js'

export function say(
  client: SocketClient,
  message: string,
  {
    delay = true,
    key,
    chattersKey,
    beta = false,
    bypassDisableCheck = false,
  }: {
    key?: SettingKeys
    chattersKey?: keyof (typeof defaultSettings)['chatters']
    delay?: boolean
    beta?: boolean
    bypassDisableCheck?: boolean
  } = {},
) {
  if (beta && !client.beta_tester) return

  // Check if account is disabled - prevent all chat messages if disabled (unless bypassed)
  if (!bypassDisableCheck) {
    const isDisabled = getValueOrDefault(
      DBSettings.commandDisable,
      client.settings,
      client.subscription,
    )
    if (isDisabled) return
  }

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

  delayedQueue.addTask(
    getStreamDelay(client.settings, client.subscription),
    (payload) => {
      payload.clientName && chatClient.say(payload.clientName, payload.message)
    },
    { clientName: client.name, message: msg },
  )
}
