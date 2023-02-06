import { t } from 'i18next'

import { chatClient } from '../index.js'
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

    chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
  },
})
