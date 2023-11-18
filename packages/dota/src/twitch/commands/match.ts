import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('match', {
  aliases: ['matchid'],
  onlyOnline: true,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = client.gsi?.map?.matchid

    if (!matchId) {
      chatClient.say(
        message.channel.name,
        t('gameNotFound', { lng: message.channel.client.locale }),
      )
      return
    }

    chatClient.say(
      message.channel.name,
      t('matchId', { lng: message.channel.client.locale, matchId }),
    )
  },
})
