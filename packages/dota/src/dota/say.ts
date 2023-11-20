import { DBSettings, defaultSettings, getValueOrDefault, SettingKeys } from '@dotabod/settings'
import { t } from 'i18next'

import { chatClient } from '../twitch/chatClient.js'
import { SocketClient } from '../types.js'
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

  // TODO: Determine all the providers to send to
  // Right now it just goes down the list until one matches
  // Need to send to all
  if (!delay) {
    chatClient.say(`${client.kick || client.youtube || client.name}`, msg)
    return
  }

  setTimeout(() => {
    client.token && chatClient.say(`${client.kick || client.youtube || client.name}`, msg)
  }, getStreamDelay(client.settings))
}
