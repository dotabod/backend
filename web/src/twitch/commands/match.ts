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
    const matchid = client.gsi?.map?.matchid

    if (!matchid) {
      void chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
      return
    }

    void chatClient.say(channel, t('matchId', { lng: message.channel.client.locale, matchid }))
  },
})
