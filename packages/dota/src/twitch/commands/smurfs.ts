import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { gsiHandlers } from '../../dota/lib/consts.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { smurfs } from '../../steam/smurfs.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'

commandHandler.registerCommand('smurfs', {
  aliases: ['lifetimes', 'totals', 'games', 'smurf'],
  onlyOnline: true,
  dbkey: DBSettings.commandSmurfs,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { client },
    } = message

    if (!message.channel.client.steam32Id) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
      )
      return
    }

    const { matchPlayers } = await getAccountsFromMatch(client.gsi)

    smurfs(client.locale, message.channel.client.gsi?.map?.matchid, matchPlayers)
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
