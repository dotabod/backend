import { t } from 'i18next'

import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('ping', {
  handler: (message: MessageType, args: string[]) => {
    chatClient.say(message.channel.name, t('ping', { lng: message.channel.client.locale }))
  },
})
