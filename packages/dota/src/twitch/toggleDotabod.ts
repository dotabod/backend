import { t } from 'i18next'

import findUser from '../dota/lib/connectedStreamers.js'
import { gsiHandlers } from '../dota/lib/consts.js'
import { say } from '../dota/say.js'
import { logger } from '../utils/logger.js'

export function toggleDotabod(token: string, isBotDisabled: boolean, lng = 'en') {
  if (!isBotDisabled) {
    logger.info('[GSI] toggleDotabod Enabling client again', { token })
    if (!gsiHandlers.has(token)) {
      logger.info('[ENABLE GSI] Could not find client', { token })
    } else {
      gsiHandlers.get(token)?.enable()
    }
  }

  const client = findUser(token)
  if (client) say(client, t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }))

  if (isBotDisabled) {
    if (!gsiHandlers.has(token)) {
      logger.info('[REMOVE GSI] Could not find client', { token })
      return
    }

    logger.info('[REMOVE GSI] Disabling GSI client from responding', { token })
    gsiHandlers.get(token)?.disable()
  }
}
