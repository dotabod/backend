import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import lastgame from '../../steam/lastgame.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('lg', {
  aliases: ['lastgame'],
  onlyOnline: true,
  dbkey: DBSettings.commandLG,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    if (!message.channel.client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount ? t('multiAccount', { lng: message.channel.client.locale, url: 'dotabod.com/dashboard/features' }) : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    lastgame({
      currentMatchId: message.channel.client.gsi?.map?.matchid,
      locale: message.channel.client.locale,
      currentPlayers:
        gsiHandlers.get(client.token)?.players?.matchPlayers || getCurrentMatchPlayers(client.gsi),
      steam32Id: message.channel.client.steam32Id,
    })
      .then((desc) => {
        chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        )
      })
  },
})
