import { t } from 'i18next'

import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('friends', {
  permission: 4,

  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    const matchId = client.gsi?.map?.matchid

    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi) || !matchId) {
      chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    chatClient.say(channel, t('matchId', { lng: message.channel.client.locale, matchId }))
  },
})
