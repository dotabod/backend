import { t } from 'i18next'

import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch'
import { DBSettings } from '../../settings'
import { smurfs } from '../../steam/smurfs'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('smurfs', {
  aliases: ['lifetimes', 'totals', 'games', 'smurf'],
  onlyOnline: true,
  dbkey: DBSettings.commandSmurfs,
  handler: async (message) => {
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
        message.user.messageId,
      )
      return
    }

    const { matchPlayers } = await getAccountsFromMatch({ gsi: client.gsi })

    smurfs(client.locale, message.channel.client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        chatClient.say(message.channel.name, desc, message.user.messageId)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
          message.user.messageId,
        )
      })
  },
})
