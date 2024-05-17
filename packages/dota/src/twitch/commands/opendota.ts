import { t } from 'i18next'

import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('opendota', {
  dbkey: DBSettings.commandOpendota,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (client.steam32Id && Number(client.steam32Id)) {
      chatClient.say(
        channel,
        t('profileUrl', {
          channel: client.name,
          lng: message.channel.client.locale,
          url: `opendota.com/players/${client.steam32Id.toString()}`,
        }),
      )
      return
    }

    chatClient.say(
      channel,
      message.channel.client.multiAccount
        ? t('multiAccount', {
            lng: message.channel.client.locale,
            url: 'dotabod.com/dashboard/features',
          })
        : t('unknownSteam', { lng: message.channel.client.locale }),
    )
  },
})
