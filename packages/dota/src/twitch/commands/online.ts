import { t } from 'i18next'

import { prisma } from '../../db/prisma.js'
import { server } from '../../dota/index.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('online', {
  aliases: ['offline', 'forceonline', 'forceoffline'],
  permission: 2,
  cooldown: 0,
  handler: (message, args, command) => {
    async function handler() {
      const {
        channel: { name: channel, client },
      } = message

      const forceOnline = command === 'forceonline' || command === 'online'
      if (message.channel.client.stream_online === forceOnline) {
        chatClient.say(
          message.channel.name,
          t('stream', {
            lng: message.channel.client.locale,
            channel: message.channel.name,
            state: message.channel.client.stream_online
              ? t('online', { lng: message.channel.client.locale })
              : t('offline', { lng: message.channel.client.locale }),
            command: message.channel.client.stream_online ? 'offline' : 'online',
            context: 'none',
          }),
        )
        return
      }

      await prisma.user.update({
        where: {
          id: message.channel.client.token,
        },
        data: {
          stream_online: forceOnline,
          stream_start_date: null,
        },
      })

      if (forceOnline) {
        chatClient.say(channel, t('refresh', { lng: message.channel.client.locale }))
        server.io.to(client.token).emit('refresh')
      }

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
