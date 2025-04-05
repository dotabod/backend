import { t } from 'i18next'
import { getRankDescription, getRankTitle, getOpenDotaProfile } from '../../dota/lib/ranks.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { logger } from '@dotabod/shared-utils'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    // Check if args include a twitch username
    if (args.length > 0) {
      const username = args[0].toLowerCase().replace(/^@/, '')
      const openDotaProfile = await getOpenDotaProfile(username)
      if (openDotaProfile !== null) {
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

    // Now check the db setting to see if its disabled
    const mmrDisabled = getValueOrDefault(
      DBSettings.commandMmr,
      client.settings,
      client.subscription,
    )
    if (mmrDisabled) {
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
