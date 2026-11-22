import { t } from 'i18next'

import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const commandsCommand: CommandDefinition = {
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType) => {
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
  name: 'commands',
}
