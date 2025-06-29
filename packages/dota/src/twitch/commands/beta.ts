import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('beta', {
  aliases: ['joinbeta', 'leavebeta', 'betaoff', 'betaon'],
  permission: 2,
  cooldown: 0,
  handler: (message: MessageType, args: string[]) => {
    async function handler() {
      await supabase
        .from('users')
        .update({
          beta_tester: !message.channel.client.beta_tester,
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.channel.client.token)

      chatClient.say(
        message.channel.name,
        t('betaTester', {
          lng: message.channel.client.locale,
          channel: message.channel.name,
          context: message.channel.client.beta_tester ? 'off' : 'on',
        }),
        message.user.messageId,
      )
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in beta command', { e })
    }
  },
})
