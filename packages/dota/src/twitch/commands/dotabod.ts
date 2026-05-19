import { t } from 'i18next'

import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('dotabod', {
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    chatClient.say(
      channel,
      t('dotabod', { url: 'dotabod.com', author: '@techleed ', lng: client.locale }),
      message.user.messageId,
    )
  },
})
