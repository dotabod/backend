import { supabase, trackResolveReason } from '@dotabod/shared-utils'
import { t } from 'i18next'
import { ranks } from '../../dota/lib/consts.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

// Extract unique rank titles and map them to their base tier values
const rankTitles: Record<string, number> = {}
ranks.forEach((rank) => {
  // Extract base rank name without stars
  const baseRank = rank.title.split('☆')[0].toLowerCase()
  // Get first digit of the image which represents the medal tier
  const medalTier = Number(rank.image[0]) * 10

  // Only add if not already in the map
  if (!rankTitles[baseRank]) {
    rankTitles[baseRank] = medalTier
  }
})

// Add immortal (not in ranks array because it's special)
rankTitles.immortal = 80

commandHandler.registerCommand('only', {
  permission: 2, // Mod or broadcaster only
  cooldown: 0,
  dbkey: DBSettings.commandOnly,
  handler: async (message: MessageType, args: string[]) => {
    const disableCommands = ['off', 'disable', 'stop']
    const {
      channel: { name: channel, client },
    } = message

    // Get current rank only settings
    const rankOnlySettings = getValueOrDefault(
      DBSettings.rankOnly,
      client.settings,
      client.subscription,
    )

    // If no args provided, show current status
    if (args.length === 0) {
      if (rankOnlySettings.enabled) {
        const requiredRank = rankOnlySettings.minimumRank || 'Herald'
        chatClient.say(
          channel,
          t('rankOnlyStatus', {
            context: 'enabled',
            rank: requiredRank,
            url: 'dotabod.com/verify',
            lng: message.channel.client.locale,
          }),
          message.user.messageId,
        )
      } else {
        chatClient.say(
          channel,
          t('rankOnlyStatus', {
            context: 'disabled',
            rank: '',
            lng: message.channel.client.locale,
          }),
          message.user.messageId,
        )
      }
      return
    }

    // Handle disabling the mode
    const rankArg = args[0].toLowerCase().trim()
    if (disableCommands.includes(rankArg)) {
      const userId = message.channel.client.token

      // Track resolve reason when disabling rank restriction
      await trackResolveReason(userId, DBSettings.rankOnly, false)

      await supabase.from('settings').upsert(
        {
          userId,
          key: DBSettings.rankOnly,
          value: JSON.stringify({
            ...rankOnlySettings,
            enabled: false,
          }),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'userId, key',
        },
      )

      chatClient.say(
        channel,
        t('rankOnlyDisabled', { lng: message.channel.client.locale }),
        message.user.messageId,
      )
      return
    }

    let minimumRankTier = 0
    let minimumRank = ''

    // Check if it's a valid rank title
    for (const [title, tier] of Object.entries(rankTitles)) {
      if (rankArg.includes(title)) {
        minimumRankTier = tier
        minimumRank = title.charAt(0).toUpperCase() + title.slice(1)
        break
      }
    }

    // If no valid rank found
    if (minimumRankTier === 0) {
      const validRanks = Object.keys(rankTitles)
        .map((r) => r.charAt(0).toUpperCase() + r.slice(1))
        .join(', ')

      chatClient.say(
        channel,
        t('rankOnlyInvalid', {
          lng: message.channel.client.locale,
          validRanks,
        }),
        message.user.messageId,
      )
      return
    }

    // Update the settings
    await supabase.from('settings').upsert(
      {
        userId: message.channel.client.token,
        key: DBSettings.rankOnly,
        value: JSON.stringify({
          enabled: true,
          minimumRank,
          minimumRankTier,
        }),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'userId, key',
      },
    )

    chatClient.say(
      channel,
      t('rankOnlyEnabled', {
        rank: minimumRank,
        url: 'dotabod.com/verify',
        lng: message.channel.client.locale,
      }),
      message.user.messageId,
    )
  },
})
