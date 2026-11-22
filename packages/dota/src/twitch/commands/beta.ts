import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const betaCommand: CommandDefinition = {
  aliases: ['joinbeta', 'leavebeta', 'betaoff', 'betaon'],
  cooldown: 0,
  handler: async (message: MessageType) => {
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
  },
  name: 'beta',
  permission: 2,
}
