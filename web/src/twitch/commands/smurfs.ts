import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { smurfs } from '../../steam/smurfs.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('smurfs', {
  aliases: ['lifetimes', 'totals', 'games', 'smurf'],

  onlyOnline: true,
  dbkey: DBSettings.commandSmurfs,
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
    smurfs(
      client.locale,
      message.channel.client.gsi?.map?.matchid,
      gsiHandlers.get(client.token)?.players?.matchPlayers || getCurrentMatchPlayers(client.gsi),
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
