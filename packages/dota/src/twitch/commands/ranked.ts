import { delayedGames } from '@dotabod/prisma/dist/mongo/index.js'
import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import Mongo from '../../steam/mongo.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

const mongo = await Mongo.connect()
commandHandler.registerCommand('ranked', {
  aliases: ['isranked'],
  onlyOnline: true,
  dbkey: DBSettings.commandRanked,
  handler: (message: MessageType, args: string[]) => {
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

    const currentMatchId = client.gsi?.map?.matchid

    async function handler() {
      if (!currentMatchId) {
        chatClient.say(
          channel,
          t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        )
        return
      }

      if (!Number(currentMatchId)) {
        chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
        return
      }

      const response = (await mongo
        .collection('delayedGames')
        .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames | undefined

      if (!response) {
        chatClient.say(
          channel,
          t('missingMatchData', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        )
        return
      }

      if (response.match.lobby_type === 7) {
        chatClient.say(channel, t('ranked', { context: 'yes', lng: message.channel.client.locale }))
        return
      }

      chatClient.say(channel, t('ranked', { context: 'no', lng: message.channel.client.locale }))
    }

    try {
      void handler()
    } catch (e) {
      logger.error('Error in ranked command', { e })
    }
  },
})
