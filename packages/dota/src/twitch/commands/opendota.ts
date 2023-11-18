import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('opendota', {
  dbkey: DBSettings.commandOpendota,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (client.steam32Id && Number(client.steam32Id)) {
      chatClient.say(
        message.channel.name,
        t('profileUrl', {
          channel: client.name,
          lng: message.channel.client.locale,
          url: `opendota.com/players/${client.steam32Id.toString()}`,
        }),
      )
      return
    }

    chatClient.say(
      message.channel.name,
      message.channel.client.multiAccount
        ? t('multiAccount', {
            lng: message.channel.client.locale,
            url: 'dotabod.com/dashboard/features',
          })
        : t('unknownSteam', { lng: message.channel.client.locale }),
    )
  },
})
