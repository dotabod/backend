import { t } from 'i18next'

import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('ping', {
  handler: (message: MessageType, _args: string[]) => {
    chatClient.say(
      message.channel.name,
      t('ping', { emote: 'EZ Clap', lng: message.channel.client.locale }),
      message.user.messageId
    )
  },
})
