import { t } from 'i18next'

import getHero from '../../dota/lib/get-hero'
import { DBSettings } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'
import { findResolvedMatchesInSession } from '../lib/resolve-match'

commandHandler.registerCommand('recent', {
  aliases: ['history', 'matches'],
  cooldown: 10_000,
  // Reuse the same setting as won/lost commands
  dbkey: DBSettings.commandWon,
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const matches = await findResolvedMatchesInSession(client.token, client.stream_start_date, {
      excludeMatchId: client.gsi?.map?.matchid,
      limit: 5,
    })

    if (matches.length === 0) {
      chatClient.say(
        channel,
        t('bets.noRecentMatches', { emote: 'Okayeg', lng: client.locale }),
        message.user.messageId
      )
      return
    }

    const matchList = matches
      .map((m) => {
        const hero = getHero(m.hero_name)
        const heroName = hero?.localized_name ?? m.hero_name ?? 'Unknown'
        const result = m.won ? 'W' : 'L'
        return `${m.matchId} ${result} (${heroName})`
      })
      .join(', ')

    chatClient.say(
      channel,
      t('bets.recentMatches', {
        emote: 'PauseChamp',
        lng: client.locale,
        matchList,
      }),
      message.user.messageId
    )
  },
  // Mods and broadcaster only,
  permission: 2,
})
