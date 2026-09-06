import { t } from 'i18next'

import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import lastgame from '../../steam/lastgame'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('lg', {
  aliases: ['lastgame'],
  dbkey: DBSettings.commandLG,
  handler: async (message) => {
    const {
      channel: { client },
    } = message

    if (message.channel.client.steam32Id === null || message.channel.client.steam32Id === 0) {
      chatClient.say(
        message.channel.name,
        message.channel.client.multiAccount !== undefined &&
          message.channel.client.multiAccount !== 0
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

    try {
      const description = await lastgame({
        client,
        currentMatchId: message.channel.client.gsi?.map?.matchid,
        currentPlayers: roster.players,
        locale: message.channel.client.locale,
        steam32Id: message.channel.client.steam32Id,
      })
      chatClient.say(message.channel.name, description, message.user.messageId)
    } catch (error) {
      chatClient.say(
        message.channel.name,
        error instanceof Error
          ? error.message
          : t('gameNotFound', { lng: message.channel.client.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
