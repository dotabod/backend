import { DBSettings, getValueOrDefault } from '@dotabod/settings'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('toggle', {
  aliases: ['mute', 'unmute'],
  permission: 2,
  cooldown: 0,
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
        logger.error('Failed to toggle', { e })
      })
  },
})
