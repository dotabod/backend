import { supabase } from '@dotabod/shared-utils'
import { t } from 'i18next'
import getHero, { type HeroNames } from '../../dota/lib/getHero.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('recent', {
  aliases: ['history', 'matches'],
  permission: 2, // Mods and broadcaster only
  cooldown: 10000,
  dbkey: DBSettings.commandWon, // Reuse the same setting as won/lost commands
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const startDate = client.stream_start_date ?? new Date(Date.now() - 12 * 60 * 60 * 1000)
    const currentMatchId = client.gsi?.map?.matchid

    const { data: matches, error } = await supabase
      .from('matches')
      .select('matchId, hero_name, won')
      .eq('userId', client.token)
      .not('won', 'is', null)
      .neq('matchId', currentMatchId ?? '')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)

    if (error || !matches || matches.length === 0) {
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
