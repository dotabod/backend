import { t } from 'i18next'

import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const dotabodCommand: CommandDefinition = {
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    chatClient.say(
      channel,
      t('dotabod', { author: '@techleed ', lng: client.locale, url: 'dotabod.com' }),
      message.user.messageId
    )
  },
  name: 'dotabod',
}
