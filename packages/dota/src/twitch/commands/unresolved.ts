import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import getHero, { type HeroNames } from '../../dota/lib/getHero.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('unresolved', {
  aliases: ['pending'],
  permission: 2, // Mods and broadcaster only
  cooldown: 10000,
  dbkey: DBSettings.commandWon, // Reuse the same setting as won/lost commands
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    // Use stream start date or last 12 hours (same logic as getWL.ts and resolveMatch.ts)
    const startDate =
      client.stream_start_date ?? new Date(Date.now() - 12 * 60 * 60 * 1000)

    // Get current match ID to exclude it from unresolved list
    const currentMatchId = client.gsi?.map?.matchid

    const { data: matches, error } = await supabase
      .from('matches')
      .select('matchId, hero_name, created_at')
      .eq('userId', client.token)
      .is('won', null)
      .neq('matchId', currentMatchId ?? '')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    if (error || !matches || matches.length === 0) {
      chatClient.say(
        channel,
        t('bets.noUnresolvedMatches', {
          emote: 'Okayeg',
          lng: client.locale,
        }),
        message.user.messageId,
      )
      return
    }

    // Format the match list with hero names
    const matchList = matches
      .map((m) => {
        const hero = getHero(m.hero_name as HeroNames)
        const heroName = hero?.localized_name ?? m.hero_name ?? 'Unknown'
        return `${m.matchId} (${heroName})`
      })
      .join(', ')
    const count = matches.length

    chatClient.say(
      channel,
      t('bets.unresolvedMatches', {
        count,
        matchList,
        emote: 'PauseChamp',
        lng: client.locale,
      }),
      message.user.messageId,
    )
  },
})

