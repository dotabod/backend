import { t } from 'i18next'

import { getCurrentRosterMatchId, isCurrentCustomGame } from '../../dota/lib/get-current-match-id'
import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const matchCommand: CommandDefinition = {
  aliases: ['matchid'],
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = getCurrentRosterMatchId(client)

    if (matchId === undefined || matchId.length === 0) {
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
  name: 'match',
  onlyOnline: true,
}
