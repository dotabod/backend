import { t } from 'i18next'

import { calculateAvg } from '../../dota/lib/calculateAvg'
import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { clippingDisabledNote, withClippingNote } from '../lib/clippingNote'

commandHandler.registerCommand('avg', {
  onlyOnline: true,
  dbkey: DBSettings.commandAvg,
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

    const avgDescriptor = ` - ${t('averageRank', { lng: client.locale })}`

    const roster = await new MatchDataService(client).resolveRoster()
    const note = clippingDisabledNote(client, roster.players)

    calculateAvg({
      locale: client.locale,
      currentMatchId: message.channel.client.gsi?.map?.matchid,
      players: roster.players,
    })
      .then((avg) => {
        chatClient.say(
          message.channel.name,
          withClippingNote(`${avg}${avgDescriptor}`, note),
          message.user.messageId,
        )
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          withClippingNote(e?.message ?? t('gameNotFound', { lng: client.locale }), note),
          message.user.messageId,
        )
      })
  },
})
