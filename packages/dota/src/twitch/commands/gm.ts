import { t } from 'i18next'

import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import { gameMedals } from '../../steam/medals'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler'
import { clippingDisabledNote } from '../lib/clippingNote'

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

    const roster = await new MatchDataService(client).resolveRoster()
    const note = clippingDisabledNote(client, roster.players)
    // No clip/vision data to read at 8500+ with auto-clipping off — the note IS
    // the whole reply; don't prepend the all-"Unknown" medal dump.
    if (note) {
      chatClient.sayWithoutSuggestion(message.channel.name, note, message.user.messageId)
      return
    }

    gameMedals(client.locale, message.channel.client.gsi?.map?.matchid, roster.players)
      .then((desc) => {
        chatClient.say(message.channel.name, desc, message.user.messageId)
      })
      .catch((e) => {
        chatClient.say(
          message.channel.name,
          e?.message ?? t('gameNotFound', { lng: message.channel.client.locale }),
          message.user.messageId,
        )
      })
  },
})
