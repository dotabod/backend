import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('online', {
  aliases: ['offline', 'forceonline', 'forceoffline'],
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      await prisma.user.update({
        where: {
          id: message.channel.client.token,
        },
        data: {
          stream_online: !message.channel.client.stream_online,
        },
      })

      chatClient.say(
        message.channel.name,
        t('stream', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
          context: message.channel.client.stream_online ? 'off' : 'on',
        }),
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in offline/online command', e)
    }
  },
})
