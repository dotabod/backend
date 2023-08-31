import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('steam', {
  aliases: ['steamid', 'account'],
  permission: 2,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    if (client.steam32Id && Number(client.steam32Id)) {
      chatClient.say(channel, `steamid.xyz/${client.steam32Id.toString()}`)
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
