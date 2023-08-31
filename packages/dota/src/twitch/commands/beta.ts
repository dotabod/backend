import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('beta', {
  aliases: ['joinbeta', 'leavebeta', 'betaoff', 'betaon'],
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      await prisma.user.update({
        where: {
          id: message.channel.client.token,
        },
        data: {
          beta_tester: !message.channel.client.beta_tester,
        },
      })

      chatClient.say(
        message.channel.name,
        t('betaTester', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
          context: message.channel.client.beta_tester ? 'off' : 'on',
        }),
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in beta command', { e })
    }
  },
})
