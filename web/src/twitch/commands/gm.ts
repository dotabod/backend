import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { gameMedals } from '../../steam/medals.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('gm', {
  aliases: ['medals', 'ranks'],

  onlyOnline: true,
  dbkey: DBSettings.commandGM,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message
    if (!message.channel.client.steam32Id) {
      void chatClient.say(
        message.channel.name,
        t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    gameMedals(
      client.locale,
      message.channel.client.gsi?.map?.matchid,
      getCurrentMatchPlayers(client.gsi),
    )
      .then((desc) => {
        void chatClient.say(message.channel.name, desc)
      })
      .catch((e) => {
        void chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
        )
      })
  },
})
