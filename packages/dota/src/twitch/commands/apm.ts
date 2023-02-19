import { t } from 'i18next'

import { DBSettings } from '@dotabod/settings'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('apm', {
  onlyOnline: true,
  dbkey: DBSettings.commandAPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    const commandsIssued = client.gsi.player?.commands_issued ?? 0
    const gameTime = client.gsi.map?.game_time ?? 1
    const apm = commandsIssued ? Math.round(commandsIssued / (gameTime / 60)) : 0

    chatClient.say(
      channel,
      t('apm', { emote: 'Chatting', lng: message.channel.client.locale, count: apm }),
    )
    return
  },
})
