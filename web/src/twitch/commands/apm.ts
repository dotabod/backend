import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
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
      void chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    const commandsIssued = client.gsi.player?.commands_issued ?? 0
    const gameTime = client.gsi.map?.game_time ?? 1
    const apm = commandsIssued ? Math.round(commandsIssued / (gameTime / 60)) : 0

    void chatClient.say(channel, t('apm', { lng: message.channel.client.locale, count: apm }))
    return
  },
})
