import { t } from 'i18next'

import { LOBBY_TYPE_RANKED } from '../../db/get-wl'
import { isArcade } from '../../dota/lib/is-arcade'
import { isSpectator } from '../../dota/lib/is-spectator'
import { DBSettings } from '../../settings'
import MongoDBSingleton from '../../steam/mongo-db-singleton'
import type { DelayedGames } from '../../types'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('ranked', {
  aliases: ['isranked'],
  dbkey: DBSettings.commandRanked,
  handler: async (message) => {
    const {
      channel: { name: channel, client },
    } = message

    if (client.steam32Id === null || client.steam32Id === 0) {
      chatClient.say(
        channel,
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

    const currentMatchId = client.gsi?.map?.matchid

    if (isArcade(client.gsi) || currentMatchId === '0') {
      chatClient.say(
        channel,
        t('ranked_no', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

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

      if (response.match.lobby_type === LOBBY_TYPE_RANKED) {
        chatClient.say(
          channel,
          t('ranked', { context: 'yes', lng: message.channel.client.locale }),
          message.user.messageId
        )
        return
      }
    } finally {
      mongo.close()
    }
    chatClient.say(
      channel,
      t('ranked', { context: 'no', lng: message.channel.client.locale }),
      message.user.messageId
    )
  },
  onlyOnline: true,
})
