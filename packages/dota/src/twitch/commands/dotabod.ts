import { t } from 'i18next'

import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import type { MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('dotabod', {
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
})
