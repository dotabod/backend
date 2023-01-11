import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('hero', {
  onlyOnline: true,
  dbkey: DBSettings.commandHero,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }
    if (!client.gsi?.hero?.name) {
      void chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
      return
    }

    const hero = getHero(client.gsi.hero.name)

    if (!hero) {
      void chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    void chatClient.say(
      channel,
      t('profileUrl', {
        channel: hero.localized_name,
        url: `dota2protracker.com/hero/${hero.localized_name}`,
        lng: message.channel.client.locale,
      }),
    )
  },
})
