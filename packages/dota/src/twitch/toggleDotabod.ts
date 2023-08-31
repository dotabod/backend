import { t } from 'i18next'

import { gsiHandlers } from '../dota/lib/consts.js'
import { logger } from '../utils/logger.js'
import { chatClient } from './chatClient.js'

export function toggleDotabod(token: string, isBotDisabled: boolean, channel: string, lng = 'en') {
  if (!isBotDisabled) {
    logger.info('[GSI] toggleDotabod Enabling client again', { token, channel })
    if (!gsiHandlers.has(token)) {
      logger.info('[ENABLE GSI] Could not find client', { token, channel })
    } else {
      gsiHandlers.get(token)?.enable()
    }
  }

  chatClient.say(channel, t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }))

  if (isBotDisabled) {
    if (!gsiHandlers.has(token)) {
      logger.info('[REMOVE GSI] Could not find client', { token, channel })
      return
    }

    logger.info('[REMOVE GSI] Disabling GSI client from responding', { token, channel })
    gsiHandlers.get(token)?.disable()
  }
}
