import { t } from 'i18next'

import supabase from '../../db/supabase.js'
import { logger } from '../../utils/logger.js'
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
        })
        .eq('id', message.channel.client.token)

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
