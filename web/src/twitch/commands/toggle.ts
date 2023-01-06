import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { gsiHandlers } from '../../dota/index.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

export async function toggleDotabod(
  token: string,
  isBotDisabled: boolean,
  channel: string,
  lng = 'en',
) {
  if (!isBotDisabled) {
    logger.info('[GSI] toggleDotabod Connecting new client', { token })
    await gsiHandlers.get(token)?.enable()
  }

  await chatClient.say(
    channel,
    t('toggle', { context: isBotDisabled ? 'disabled' : 'enabled', lng }),
  )

  if (isBotDisabled) {
    if (!gsiHandlers.has(token)) {
      logger.info('[REMOVE GSI] Could not find client', { token })
      return
    }

    logger.info('[REMOVE GSI] Removing GSI client', { token })
    gsiHandlers.get(token)?.disable()
  }
}

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    const isBotDisabled = getValueOrDefault(DBSettings.commandDisable, client.settings)
    prisma.setting
      .upsert({
        where: {
          key_userId: {
            userId: client.token,
            key: DBSettings.commandDisable,
          },
        },
        create: {
          userId: client.token,
          key: DBSettings.commandDisable,
          value: !isBotDisabled,
        },
        update: {
          value: !isBotDisabled,
        },
      })
      .then((r) => {
        //
      })
      .catch((e) => {
        //
      })
  },
})
