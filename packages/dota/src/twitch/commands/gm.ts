import { t } from 'i18next'

import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import { gameMedals } from '../../steam/medals'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { clippingDisabledNote, withClippingNote } from '../lib/clippingNote'

commandHandler.registerCommand('gm', {
  aliases: ['medals', 'ranks'],
  onlyOnline: true,
  dbkey: DBSettings.commandGM,
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

    const matchPlayers = await new MatchDataService(client).getMatchPlayers()
    const note = clippingDisabledNote(client, matchPlayers)

    gameMedals(client.locale, message.channel.client.gsi?.map?.matchid, matchPlayers)
      .then((desc) => {
        chatClient.say(message.channel.name, withClippingNote(desc, note), message.user.messageId)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          withClippingNote(
            e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
            note,
          ),
          message.user.messageId,
        )
      })
  },
})
