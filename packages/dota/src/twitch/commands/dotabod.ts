import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('dotabod', {
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    chatClient.say(
      channel,
      t('dotabod', { url: 'dotabod.com', author: '@techleed', lng: client.locale }),
    )
  },
})
