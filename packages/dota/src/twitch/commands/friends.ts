import { t } from 'i18next'

import { isPlayingMatch } from '../../dota/lib/is-playing-match'
import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const friendsCommand: CommandDefinition = {
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = client.gsi?.map?.matchid

    if (client.gsi?.hero?.name === undefined || client.gsi.hero.name.length === 0) {
      chatClient.say(
        channel,
        t('noHero', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }
    if (!isPlayingMatch(client.gsi) || matchId === undefined || matchId.length === 0) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
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

  name: 'friends',
  permission: 4,
}
