import { t } from 'i18next'

import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const pingCommand: CommandDefinition = {
  handler: (message: MessageType) => {
    chatClient.say(
      message.channel.name,
      t('ping', { emote: 'EZ Clap', lng: message.channel.client.locale }),
      message.user.messageId
    )
  },
  name: 'ping',
}
