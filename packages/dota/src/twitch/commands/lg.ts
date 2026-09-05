import { t } from 'i18next'

import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import lastgame from '../../steam/lastgame'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'

commandHandler.registerCommand('lg', {
  aliases: ['lastgame'],
  dbkey: DBSettings.commandLG,
  handler: async (message, _args) => {
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
        message.user.messageId
      )
      return
    }

    const roster = await new MatchDataService(client).resolveRoster()

    lastgame({
      client,
      currentMatchId: message.channel.client.gsi?.map?.matchid,
      currentPlayers: roster.players,
      locale: message.channel.client.locale,
      steam32Id: message.channel.client.steam32Id,
    })
      .then((desc) => {
        chatClient.say(message.channel.name, desc, message.user.messageId)
      })
      .catch((error) => {
        chatClient.say(
          message.channel.name,
          error?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
          message.user.messageId
        )
      })
  },
  onlyOnline: true,
})
