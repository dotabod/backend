import { t } from 'i18next'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('commands', {
  dbkey: DBSettings.commandCommands,
  handler: (message: MessageType, args: string[]) => {
    const channel = message.channel.client.name
    chatClient.say(
      channel,
      t('commands', {
        channel,
        url: `dotabod.com/commands/${channel}`,
        lng: message.channel.client.locale,
      }),
    )
  },
})
