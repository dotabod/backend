import { t } from 'i18next'
import { getRankDescription, getRankTitle, mmrToRankTier } from '../../dota/lib/ranks.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'
import supabase from '../../db/supabase.js'
async function getOpenDotaProfile(twitchUsername: string): Promise<{
  rank_tier: number
  leaderboard_rank: number
}> {
  const defaultResponse = {
    rank_tier: 0,
    leaderboard_rank: 0,
  }
  try {
    // Get user by Twitch username
    const { data: userData } = await supabase
      .from('users')
      .select('id, steam32Id')
      .ilike('name', twitchUsername)
      .single()

    if (!userData) return defaultResponse

    let steamAccount = null

    if (userData.steam32Id) {
      // If steam32Id exists directly on the user, use it
      const { data: account } = await supabase
        .from('steam_accounts')
        .select('leaderboard_rank, mmr')
        .eq('steam32Id', userData.steam32Id)
        .single()

      steamAccount = account
    } else if (userData.id) {
      // If no steam32Id on user, find their steam accounts through userId
      const { data: accounts } = await supabase
        .from('steam_accounts')
        .select('leaderboard_rank, mmr')
        .eq('userId', userData.id)
        .order('mmr', { ascending: false })
        .limit(1)

      // Get the account with the highest MMR
      steamAccount = accounts?.[0] || null
    }

    if (!steamAccount) return defaultResponse

    // Return rank information
    return {
      rank_tier: mmrToRankTier(steamAccount.mmr),
      leaderboard_rank: steamAccount.leaderboard_rank ?? 0,
    }
  } catch (error) {
    logger.error('Error fetching OpenDota profile:', error)
    return defaultResponse
  }
}

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  dbkey: DBSettings.commandMmr,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    // Check if args include a twitch username
    if (args.length > 0 && args[0].startsWith('@')) {
      const username = args[0].toLowerCase().replace('@', '')
      const openDotaProfile = await getOpenDotaProfile(username)
      if (openDotaProfile?.rank_tier && openDotaProfile.rank_tier > 0) {
        chatClient.say(
          channel,
          t('chattersRank', {
            rank:
              getRankTitle(openDotaProfile.rank_tier) +
              (openDotaProfile.leaderboard_rank > 0 ? ` #${openDotaProfile.leaderboard_rank}` : ''),
            username,
            lng: message.channel.client.locale,
          }),
          message.user.messageId,
        )
      } else {
        chatClient.say(
          channel,
          t('chattersRankUnknown', {
            username,
            url: 'dotabod.com/verify',
            lng: message.channel.client.locale,
          }),
        )
      }

      return
    }

    // If connected, we can just respond with the cached MMR
    const showRankMmr = getValueOrDefault(
      DBSettings.showRankMmr,
      client.settings,
      client.subscription,
    )
    const name = channel.replace(/^#/, '').toLowerCase()

    const unknownMsg = t('uknownMmr', {
      channel: name,
      url: 'dotabod.com/dashboard/features',
      lng: message.channel.client.locale,
    })

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      if (client.mmr === 0) {
        chatClient.say(channel, unknownMsg, message.user.messageId)
        return
      }

      getRankDescription({
        locale: client.locale,
        mmr: client.mmr,
        steam32Id: client.steam32Id ?? undefined,
        showRankMmr,
      })
        .then((description) => {
          if (description === null || description.length) {
            chatClient.say(channel, description ?? unknownMsg, message.user.messageId)
          }
        })
        .catch((e) => {
          logger.info('[MMR] Failed to get rank description', { e, channel })
        })
      return
    }

    const act = client.SteamAccount.find((a) => a.steam32Id === client.steam32Id)
    if (!act) {
      chatClient.say(
        channel,
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

    getRankDescription({
      locale: client.locale,
      mmr: act.mmr,
      steam32Id: act.steam32Id,
      showRankMmr,
    })
      .then((description) => {
        if (description === null || description.length) {
          const msg = act.name ? (description ?? unknownMsg) : ''
          chatClient.say(channel, msg || unknownMsg, message.user.messageId)
        }
      })
      .catch((e) => {
        logger.info('[MMR] Failed to get rank description', { e, channel })
      })
  },
})
