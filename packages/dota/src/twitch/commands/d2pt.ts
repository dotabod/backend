import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import getHero from '../../dota/lib/getHero.js'
import { isPlayingMatch } from '../../dota/lib/isPlayingMatch.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('d2pt', {
  aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
  onlyOnline: true,
  dbkey: DBSettings.commandBuilds,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }
    if (!isPlayingMatch(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }
    const hero = getHero(client.gsi?.hero?.name)
    if (!hero) {
      chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
      return
    }

    chatClient.say(
      channel,
      t('dota2pt', {
        heroName: hero.localized_name,
        url: `dota2protracker.com/hero/${encodeURI(hero.localized_name).replace(/'/g, '%27')}`,
        lng: message.channel.client.locale,
      }),
    )
  },
})
