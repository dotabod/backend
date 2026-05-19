import { t } from 'i18next'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('commands', {
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType, args: string[]) => {
    const channel = message.channel.client.name
    chatClient.say(
      channel,
      t('commandsPage', {
        channel,
        url: `dotabod.com/${channel}`,
        lng: message.channel.client.locale,
      }),
      message.user.messageId,
    )
  },
})
