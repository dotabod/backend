import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('xpm', {
  onlyOnline: true,
  dbkey: DBSettings.commandXPM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, t('noHero', { lng: client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: client.locale }))
      return
    }
    const xpm = client.gsi.player?.xpm ?? 0
    void chatClient.say(channel, t('xpm', { lng: client.locale, num: xpm }))
    return
  },
})
