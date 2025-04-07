import { t } from 'i18next'

import { logger } from '@dotabod/shared-utils'
import { gsiHandlers } from '../dota/lib/consts.js'
import { chatClient } from './chatClient.js'
import { twitchEvent } from './index.js'

export function toggleDotabod(token: string, isBotDisabled: boolean, channel: string, lng = 'en') {
  const gsiHandler = gsiHandlers.get(token)
  const hasHandler = gsiHandlers.has(token)

  if (!hasHandler) {
    logger.info('[GSI] Could not find client', { token, channel })
    return
  }

  if (isBotDisabled) {
    logger.info('[GSI] Disabling client', { token, channel })
    gsiHandler?.disable()
  } else {
    logger.info('[GSI] Enabling client', { token, channel })
    twitchEvent.emit('enable', gsiHandler?.getChannelId())
    gsiHandler?.enable()
  }

  chatClient.say(channel, t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }))
}
