import { t } from 'i18next'

import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('version', {
  handler: (message: MessageType, args: string[]) => {
    if (!process.env.COMMIT_HASH) {
      chatClient.say(
        message.channel.name,
        t('version.unknown', {
          url: 'github.com/dotabod/backend',
          lng: message.channel.client.locale,
        }),
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('version.commit', {
        lng: message.channel.client.locale,
        version: process.env.COMMIT_HASH,
        url: `github.com/dotabod/backend/compare/${process.env.COMMIT_HASH || ''}...master`,
      }),
    )
  },
})
