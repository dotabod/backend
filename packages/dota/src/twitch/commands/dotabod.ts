import { t } from 'i18next'

import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

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
