import { t } from 'i18next'

import { isSpectator } from '../../dota/lib/is-spectator'
import { DBSettings } from '../../settings'
import MongoDBSingleton from '../../steam/mongo-db-singleton'
import type { DelayedGames } from '../../types'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('spectators', {
  aliases: ['specs'],
  dbkey: DBSettings.commandSpectators,
  handler: async (message) => {
    const {
      channel: { name: channel, client },
    } = message

    const currentMatchId = client.gsi?.map?.matchid
    const numericMatchId = Number(currentMatchId)
    const hasValidMatchId =
      currentMatchId !== undefined &&
      currentMatchId.length > 0 &&
      numericMatchId !== 0 &&
      !Number.isNaN(numericMatchId)

    if (!hasValidMatchId || isSpectator(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
        message.user.messageId
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
          message.user.messageId
        )
        return
      }

      chatClient.say(
        channel,
        t('spectators.count', {
          count: response.spectators ?? 0,
          lng: message.channel.client.locale,
        }),
        message.user.messageId
      )
    } finally {
      mongo.close()
    }
  },
  onlyOnline: true,
})
