import { t } from 'i18next'

import { getCurrentRosterMatchId, isCurrentCustomGame } from '../../dota/lib/get-current-match-id'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('match', {
  aliases: ['matchid'],
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
        message.user.messageId
      )
      return
    }

    chatClient.say(
      channel,
      t('matchId', { lng: message.channel.client.locale, matchId }),
      message.user.messageId
    )
  },
  onlyOnline: true,
})
