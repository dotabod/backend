import { t } from 'i18next'

import { calculateAvg } from '../../dota/lib/calculate-avg'
import { getCurrentRosterMatchId, isCurrentCustomGame } from '../../dota/lib/get-current-match-id'
import { MatchDataService } from '../../dota/lib/matchData'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import { clippingDisabledNote } from '../lib/clipping-note'
import commandHandler from '../lib/command-handler'

commandHandler.registerCommand('avg', {
  dbkey: DBSettings.commandAvg,
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

    if (client.gsi !== undefined && getCurrentRosterMatchId(client) === undefined) {
      chatClient.say(
        message.channel.name,
        t(isCurrentCustomGame(client) ? 'customGameNoRoster' : 'gameNotFound', {
          lng: client.locale,
        }),
        message.user.messageId
      )
      return
    }

    const avgDescriptor = ` - ${t('averageRank', { lng: client.locale })}`

    const roster = await new MatchDataService(client).resolveRoster()
    const note = clippingDisabledNote(client, roster.players)
    // No clip/vision data to read at 8500+ with auto-clipping off — the note IS
    // the whole reply; don't prepend a meaningless average.
    if (note) {
      chatClient.sayWithoutSuggestion(message.channel.name, note, message.user.messageId)
      return
    }

    try {
      const average = await calculateAvg({
        currentMatchId: message.channel.client.gsi?.map?.matchid,
        locale: client.locale,
        players: roster.players,
      })
      chatClient.say(message.channel.name, `${average}${avgDescriptor}`, message.user.messageId)
    } catch (error) {
      chatClient.say(
        message.channel.name,
        error instanceof Error ? error.message : t('gameNotFound', { lng: client.locale }),
        message.user.messageId
      )
    }
  },
  onlyOnline: true,
})
