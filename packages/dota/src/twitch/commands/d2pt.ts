import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import getHero from '../../dota/lib/getHero.js'
import { getHeroNameById } from '../../dota/lib/heroes.js'
import { isArcade } from '../../dota/lib/isArcade.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('d2pt', {
  aliases: ['dota2pt', 'build', 'builds', 'getbuild'],
  onlyOnline: true,
  dbkey: DBSettings.commandBuilds,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (!client.steam32Id) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    if (isArcade(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
      )
      return
    }

    const hero = getHero(client.gsi?.hero?.name)
    const spectatorPlayers = getCurrentMatchPlayers(client.gsi)
    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })
    const selectedPlayer = spectatorPlayers.find((a) => a.selected)

    if (!hero) {
      if (!selectedPlayer && !matchPlayers.length) {
        chatClient.say(channel, t('noHero', { lng: message.channel.client.locale }))
        return
      }
    }

    const heroName = hero ? hero.localized_name : getHeroNameById(selectedPlayer?.heroid ?? 0)

    chatClient.say(
      channel,
      t('dota2pt', {
        heroName,
        url: `dota2protracker.com/hero/${encodeURI(heroName).replace(/'/g, '%27')}`,
        lng: message.channel.client.locale,
      }),
    )
  },
})
