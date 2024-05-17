import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('ping', {
  handler: (message: MessageType, args: string[]) => {
    chatClient.say(
      message.channel.name,
      t('ping', { emote: 'EZ Clap', lng: message.channel.client.locale }),
    )
  },
})
