import { t } from 'i18next'

import { chatClient } from '../index.js'
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
      chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
      return
    }

    chatClient.say(channel, t('matchId', { lng: message.channel.client.locale, matchId }))
  },
})
