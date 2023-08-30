import { t } from 'i18next'

import { chatClient } from '../twitch/index.js'
import { SocketClient } from '../types.js'
import { getStreamDelay } from './GSIHandler.js'

export function say(
  client: SocketClient,
  message: string,
  { delay = true, beta = false }: { delay?: boolean; beta?: boolean } = {},
) {
  if (beta && !client.beta_tester) return

  const msg = beta ? `${message} ${t('betaFeature', { lng: client.locale })}` : message
  if (!delay) {
    chatClient.say(client.name, msg)
    return
  }

  setTimeout(() => {
    client.name && chatClient.say(client.name, msg)
  }, getStreamDelay(client.settings))
}
