import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('xpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.hero?.name) {
      chatClient.say(channel, t('noHero', { lng: client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(channel, t('notPlaying', { emote: 'PauseChamp', lng: client.locale }))
      return
    }
    const xpm = client.gsi.player?.xpm ?? 0
    chatClient.say(channel, t('xpm', { lng: client.locale, num: xpm }))
    return
  },
})
