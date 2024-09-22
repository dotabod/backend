import { t } from 'i18next'

import { LOBBY_TYPE_RANKED } from '../../db/getWL'
import { isArcade } from '../../dota/lib/isArcade.js'
import { isSpectator } from '../../dota/lib/isSpectator.js'
import { DBSettings } from '../../settings.js'
import MongoDBSingleton from '../../steam/MongoDBSingleton.js'
import type { DelayedGames } from '../../types.js'
import { chatClient } from '../chatClient.js'
import commandHandler from '../lib/CommandHandler.js'

commandHandler.registerCommand('ranked', {
  aliases: ['isranked'],
  onlyOnline: true,
  dbkey: DBSettings.commandRanked,
  handler: async (message, args) => {
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

    if (isArcade(client.gsi) || currentMatchId === '0') {
      chatClient.say(channel, t('ranked_no', { lng: message.channel.client.locale }))
      return
    }

    if (!currentMatchId || !Number(currentMatchId) || isSpectator(client.gsi)) {
      chatClient.say(
        channel,
        t('notPlaying', { emote: 'PauseChamp', lng: message.channel.client.locale }),
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
        )
        return
      }

      if (response.match.lobby_type === LOBBY_TYPE_RANKED) {
        chatClient.say(channel, t('ranked', { context: 'yes', lng: message.channel.client.locale }))
        return
      }
    } finally {
      await mongo.close()
    }
    chatClient.say(channel, t('ranked', { context: 'no', lng: message.channel.client.locale }))
  },
})
