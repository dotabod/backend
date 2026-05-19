import { t } from 'i18next'
import getHero, { type HeroNames } from '../../dota/lib/getHero'
import { DBSettings } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler, { type MessageType } from '../lib/CommandHandler'
import { findResolvedMatchesInSession } from '../lib/resolveMatch'

commandHandler.registerCommand('recent', {
  aliases: ['history', 'matches'],
  permission: 2, // Mods and broadcaster only
  cooldown: 10000,
  dbkey: DBSettings.commandWon, // Reuse the same setting as won/lost commands
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const matches = await findResolvedMatchesInSession(client.token, client.stream_start_date, {
      limit: 5,
      excludeMatchId: client.gsi?.map?.matchid,
    })

    if (matches.length === 0) {
      chatClient.say(
        channel,
        t('bets.noRecentMatches', { emote: 'Okayeg', lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    const matchList = matches
      .map((m) => {
        const hero = getHero(m.hero_name as HeroNames)
        const heroName = hero?.localized_name ?? m.hero_name ?? 'Unknown'
        const result = m.won ? 'W' : 'L'
        return `${m.matchId} ${result} (${heroName})`
      })
      .join(', ')

    chatClient.say(
      channel,
      t('bets.recentMatches', {
        matchList,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      message.user.messageId,
    )
  },
})
