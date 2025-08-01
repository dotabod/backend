import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { server } from '../../dota/server.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('resetwl', {
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      const {
        channel: { name: channel, client },
      } = message

      await supabase
        .from('users')
        .update({
          stream_start_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.channel.client.token)

      chatClient.say(
        channel,
        t('refresh', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      if (server?.io) {
        server.io.to(client.token).emit('refresh')
      }

      chatClient.say(
        message.channel.name,
        t('resetwl', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
        }),
        message.user.messageId,
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in resetwl command', e)
    }
  },
})
