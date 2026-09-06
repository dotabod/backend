import { t } from 'i18next'

import { isPlayingMatch } from '../../dota/lib/is-playing-match'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('friends', {
  handler: (message: MessageType, _args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = client.gsi?.map?.matchid

    if (!client.gsi?.hero?.name) {
      chatClient.say(
        channel,
        t('noHero', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }
    if (!isPlayingMatch(client.gsi) || !matchId) {
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

  permission: 4,
})
