import { t } from 'i18next'

import { getCurrentRosterMatchId, isCurrentCustomGame } from '../../dota/lib/getCurrentMatchId'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'

commandHandler.registerCommand('match', {
  aliases: ['matchid'],
  onlyOnline: true,
  handler: (message: MessageType, _args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = getCurrentRosterMatchId(client)

    if (!matchId) {
      chatClient.say(
        channel,
        t(isCurrentCustomGame(client) ? 'customGameNoMatchId' : 'currentMatchIdNotFound', {
          lng: message.channel.client.locale,
        }),
        message.user.messageId,
      )
      return
    }

    chatClient.say(
      channel,
      t('matchId', { lng: message.channel.client.locale, matchId }),
      message.user.messageId,
    )
  },
})
