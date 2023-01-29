import { t } from 'i18next'

import { delayedGames } from '../../../prisma/generated/mongoclient/index.js'
import { DBSettings } from '../../db/settings.js'
import Mongo from '../../steam/mongo.js'
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
      void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }

    const currentMatchId = client.gsi?.map?.matchid

    async function handler() {
      if (!currentMatchId) {
        void chatClient.say(channel, t('notPlaying', { lng: message.channel.client.locale }))
        return
      }

      if (!Number(currentMatchId)) {
        void chatClient.say(channel, t('gameNotFound', { lng: message.channel.client.locale }))
        return
      }

      const response = (await mongo
        .collection('delayedGames')
        .findOne({ 'match.match_id': currentMatchId })) as unknown as delayedGames | undefined

      if (!response) {
        void chatClient.say(channel, t('missingMatchData', { lng: message.channel.client.locale }))
        return
      }

      if (response.match.lobby_type === 7) {
        void chatClient.say(
          channel,
          t('ranked', { context: 'yes', lng: message.channel.client.locale }),
        )
        return
      }

      void chatClient.say(
        channel,
        t('ranked', { context: 'no', lng: message.channel.client.locale }),
      )
    }

    void handler()
  },
})
