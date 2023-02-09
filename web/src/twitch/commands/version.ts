import { t } from 'i18next'

import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('version', {
  handler: (message: MessageType, args: string[]) => {
    if (!process.env.COMMIT_HASH) {
      chatClient.say(
        message.channel.name,
        t('versionNoCommit', {
          url: 'github.com/dotabod/backend',
          lng: message.channel.client.locale,
        }),
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('version', {
        lng: message.channel.client.locale,
        url: `github.com/dotabod/backend/commit/${process.env.COMMIT_HASH || ''}`,
      }),
    )
  },
})
