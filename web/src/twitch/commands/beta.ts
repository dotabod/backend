import { prisma } from '../../db/prisma.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('beta', {
  aliases: ['joinbeta', 'leavebeta', 'betaoff', 'betaon'],
  permission: 2,
  cooldown: 15000,
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

      void chatClient.say(
        message.channel.name,
        `${message.channel.name} is now ${
          message.channel.client.beta_tester ? 'not' : ''
        } a beta tester.${
          !message.channel.client.beta_tester
            ? ' Visit discord.dotabod.com to see the beta features. '
            : ''
        } Type !beta to undo`,
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in beta command', e)
    }
  },
})
