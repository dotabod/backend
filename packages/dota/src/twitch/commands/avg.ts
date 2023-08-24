import { delayedGames } from '@dotabod/prisma/dist/mongo'
import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { calculateAvg } from '../../dota/lib/calculateAvg.js'
import { getAccountsFromMatch } from '../../dota/lib/getAccountsFromMatch.js'
import { getCurrentMatchPlayers } from '../../dota/lib/getCurrentMatchPlayers.js'
import { mongoClient } from '../../steam/index.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('avg', {
  onlyOnline: true,
  dbkey: DBSettings.commandAvg,
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

    const avgDescriptor = ` - ${t('averageRank', { lng: client.locale })}`

    const { matchPlayers } = await getAccountsFromMatch(client.gsi)

    calculateAvg({
      locale: client.locale,
      currentMatchId: message.channel.client.gsi?.map?.matchid,
      players: matchPlayers,
    })
      .then((avg) => {
        chatClient.say(message.channel.name, `${avg}${avgDescriptor}`)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: client.locale }),
        )
      })
  },
})
