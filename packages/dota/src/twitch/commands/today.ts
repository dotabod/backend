import { t } from 'i18next'
import { getTodayHeroStats } from '../../db/getTodayHeroStats.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

// Twitch chat limit is 500 characters
const TWITCH_CHAR_LIMIT = 500

// Format a single hero stat: "Hero 3-1" or "Hero 0-2"
function formatHeroStat(heroName: string, wins: number, losses: number): string {
  return `${heroName} ${wins}-${losses}`
}

// Split message into chunks that fit within Twitch's character limit
function splitIntoMessages(parts: string[], separator: string, limit: number): string[] {
  const messages: string[] = []
  let current = ''

  for (const part of parts) {
    const wouldBe = current ? `${current}${separator}${part}` : part
    if (wouldBe.length <= limit) {
      current = wouldBe
    } else {
      if (current) messages.push(current)
      current = part
    }
  }

  if (current) messages.push(current)
  return messages
}

commandHandler.registerCommand('today', {
  aliases: ['td'],
  dbkey: DBSettings.commandToday,
  handler: async (message: MessageType) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!client.steam32Id) {
      chatClient.say(
        channel,
        client.multiAccount
          ? t('multiAccount', {
              lng: client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: client.locale }),
        message.user.messageId,
      )
      return
    }

    const heroStats = await getTodayHeroStats({
      token: client.token,
      startDate: client.stream_start_date,
    })

    if (!heroStats.length) {
      chatClient.say(channel, t('today.noGames', { lng: client.locale }), message.user.messageId)
      return
    }

    // Format each hero stat
    const formattedStats = heroStats.map((stat) =>
      formatHeroStat(stat.heroName, stat.wins, stat.losses),
    )

    // Calculate totals
    const totalWins = heroStats.reduce((sum, stat) => sum + stat.wins, 0)
    const totalLosses = heroStats.reduce((sum, stat) => sum + stat.losses, 0)
    const totalGames = totalWins + totalLosses

    // Build the message parts
    const separator = ' | '

    // Try to fit everything in one message first
    const heroStatsStr = formattedStats.join(separator)
    const summaryStr = t('today.summary', {
      lng: client.locale,
      wins: totalWins,
      losses: totalLosses,
      total: totalGames,
    })

    const fullMessage = `${heroStatsStr} · ${summaryStr}`

    if (fullMessage.length <= TWITCH_CHAR_LIMIT) {
      chatClient.say(channel, fullMessage, message.user.messageId)
      return
    }

    // If too long, split hero stats across messages
    // Reserve space for potential continuation indicator
    const effectiveLimit = TWITCH_CHAR_LIMIT - 10

    const chunks = splitIntoMessages(formattedStats, separator, effectiveLimit)

    // Send hero stat chunks
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1
      const msg = isLast ? `${chunks[i]} · ${summaryStr}` : chunks[i]

      // Only include messageId for first message to avoid spam
      chatClient.say(channel, msg, i === 0 ? message.user.messageId : undefined)
    }
  },
})
