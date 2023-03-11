import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('resetwl', {
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      await prisma.user.update({
        where: {
          id: message.channel.client.token,
        },
        data: {
          stream_start_date: new Date(),
        },
      })

      chatClient.say(
        message.channel.name,
        t('resetwl', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
        }),
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in resetwl command', e)
    }
  },
})
