import { t } from 'i18next'

import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler';
import type { MessageType } from '../lib/CommandHandler';

commandHandler.registerCommand('commands', {
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType, _args: string[]) => {
    const channel = message.channel.client.name
    chatClient.say(
      channel,
      t('commandsPage', {
        channel,
        lng: message.channel.client.locale,
        url: `dotabod.com/${channel}`,
      }),
      message.user.messageId
    )
  },
})
