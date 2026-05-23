import { t } from 'i18next'

import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('ping', {
  handler: (message: MessageType, _args: string[]) => {
    chatClient.say(
      message.channel.name,
      t('ping', { emote: 'EZ Clap', lng: message.channel.client.locale }),
      message.user.messageId,
    )
  },
})
