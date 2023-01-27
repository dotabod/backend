import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { DBSettings } from '../../db/settings.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('setdelay', {
  aliases: ['delay=', 'setstreamdelay', 'streamdelay='],
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    if (isNaN(Number(args[0]))) {
      void chatClient.say(
        message.channel.name,
        t('setStreamDelayNoArgs', {
          lng: message.channel.client.locale,
        }),
      )

      return
    }

    async function handler() {
      await prisma.setting.upsert({
        where: {
          key_userId: {
            key: DBSettings.streamDelay,
            userId: message.channel.client.token,
          },
        },
        create: {
          userId: message.channel.client.token,
          key: DBSettings.bets,
          value: (Number(args[0]) || 0) * 1000,
        },
        update: {
          value: (Number(args[0]) || 0) * 1000,
        },
      })

      void chatClient.say(
        message.channel.name,
        t('setStreamDelay', {
          lng: message.channel.client.locale,
          num: Number(args[0]) || 0,
        }),
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in set stream delay command', { e })
    }
  },
})
