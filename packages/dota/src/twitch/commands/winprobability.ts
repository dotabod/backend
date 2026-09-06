import { t } from 'i18next'

import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('winprobability', {
  aliases: ['win%', 'wp'],
  dbkey: DBSettings.commandWinProbability,
  handler: (message) => {
    const {
      channel: { name: channel, client },
    } = message

    const matchId = client.gsi?.map?.matchid
    if (matchId === undefined || matchId.length === 0) {
      chatClient.say(
        channel,
        t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    chatClient.say(
      channel,
      t('matchDataValveDisabled', { emote: 'PoroSad', lng: message.channel.client.locale }),
      message.user.messageId
    )
  },
  onlyOnline: true,
})
