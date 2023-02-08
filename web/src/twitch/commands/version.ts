import { t } from 'i18next'

import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('version', {
  handler: (message: MessageType, args: string[]) => {
    chatClient.say(
      message.channel.name,
      t('commands.version', {
        url: `github.com/dotabod/backend/commit/${process?.env?.COMMIT_HASH || ''}`,
      }),
    )
  },
})
