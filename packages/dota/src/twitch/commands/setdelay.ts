import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('setdelay', {
  aliases: ['delay=', 'setstreamdelay', 'streamdelay='],
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    if (isNaN(Number(args[0]))) {
      chatClient.say(
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
          key: DBSettings.streamDelay,
          value: (Number(args[0]) || 0) * 1000,
        },
        update: {
          value: (Number(args[0]) || 0) * 1000,
        },
      })

      chatClient.say(
        message.channel.name,
        !(Number(args[0]) || 0)
          ? t('setStreamDelayRemoved', {
              lng: message.channel.client.locale,
            })
          : t('setStreamDelay', {
              lng: message.channel.client.locale,
              seconds: Number(args[0]) || 0,
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
