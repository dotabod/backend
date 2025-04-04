import { t } from 'i18next'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings } from '../../settings.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { DelayedGames } from '../../types.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('spectators', {
  aliases: ['specs'],
  onlyOnline: true,
  dbkey: DBSettings.commandSpectators,
  handler: async (message, args) => {
    const {
      channel: { name: channel, client },
    } = message

    const currentMatchId = client.gsi?.map?.matchid

    if (!currentMatchId || !Number(currentMatchId) || isSpectator(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    const mongo = MongoDBSingleton
    const db = await mongo.connect()

    try {
      const response = await db
        .collection<DelayedGames>('delayedGames')
        .findOne({ 'match.match_id': currentMatchId })

      if (!response) {
        chatClient.say(
          channel,
          t('missingMatchData', { emote: 'PauseChamp', lng: message.channel.client.locale }),
          message.user.messageId,
        )
        return
      }

      chatClient.say(
        channel,
        t('spectators.count', {
          count: response.spectators || 0,
          lng: message.channel.client.locale,
        }),
        message.user.messageId,
      )
    } finally {
      await mongo.close()
    }
  },
})
