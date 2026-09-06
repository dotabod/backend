import { logger, supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('beta', {
  aliases: ['joinbeta', 'leavebeta', 'betaoff', 'betaon'],
  cooldown: 0,
  handler: (message: MessageType, _args: string[]) => {
    const handler = async function handler() {
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
          channel: message.channel.name,
          context: message.channel.client.beta_tester ? 'off' : 'on',
          lng: message.channel.client.locale,
        }),
        message.user.messageId
      )
    }

    try {
      void handler()
    } catch (error) {
      logger.error('Error in beta command', { error })
    }
  },
  permission: 2,
})
