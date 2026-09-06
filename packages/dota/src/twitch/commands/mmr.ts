import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { getDotabodRankProfile, getRankDescription, getRankTitle } from '../../dota/lib/ranks'
import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  dbkey: DBSettings.commandMmr,
  handler: async (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    logger.debug('[MMR] Command triggered', { args, channel })

    // Check if args include a twitch username
    if (args.length > 0) {
      const username = args[0].toLowerCase().replace(/^@/u, '')
      logger.debug('[MMR] Looking up username', { channel, username })

      const rankProfile = await getDotabodRankProfile(username)
      logger.debug('[MMR] Dotabod rank profile result', {
        found: rankProfile !== null,
        profile: rankProfile,
        username,
      })

      if (rankProfile === null) {
        chatClient.say(
          channel,
          t('chattersRankUnknown', {
            lng: message.channel.client.locale,
            url: 'dotabod.com/verify',
            username: (await moderateText(username)) || username,
          })
        )
      } else {
        chatClient.say(
          channel,
          t('chattersRank', {
            lng: message.channel.client.locale,
            rank:
              getRankTitle(rankProfile.rank_tier) +
              (rankProfile.leaderboard_rank > 0 ? ` #${rankProfile.leaderboard_rank}` : ''),
            username,
          }),
          message.user.messageId
        )
      }

      return
    }

    // Now check the db setting to see if its disabled
    const mmrEnabled = getValueOrDefault(
      DBSettings.commandMmr,
      client.settings,
      client.subscription
    )

    if (!mmrEnabled) {
      logger.debug('[MMR] Command is disabled, exiting', { channel })
      return
    }

    // If connected, we can just respond with the cached MMR
    const showRankMmr = getValueOrDefault(
      DBSettings.showRankMmr,
      client.settings,
      client.subscription
    )
    const name = channel.replace(/^#/u, '').toLowerCase()

    logger.debug('[MMR] Getting streamer rank', {
      channel,
      hasSteamAccounts: client.SteamAccount?.length > 0,
      mmr: client.mmr,
      showRankMmr,
      steam32Id: client.steam32Id,
    })

    const unknownMsg = t('uknownMmr', {
      channel: name,
      lng: message.channel.client.locale,
      url: 'dotabod.com/dashboard/features',
    })

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      logger.debug('[MMR] No Steam accounts found', { channel, mmr: client.mmr })

      if (client.mmr === 0) {
        logger.debug('[MMR] MMR is 0, sending unknown message', { channel })
        chatClient.say(channel, unknownMsg, message.user.messageId)
        return
      }

      logger.debug('[MMR] Using legacy MMR data', {
        channel,
        mmr: client.mmr,
        steam32Id: client.steam32Id,
      })

      getRankDescription({
        locale: client.locale,
        mmr: client.mmr,
        showRankMmr,
        steam32Id: client.steam32Id ?? undefined,
      })
        .then((description) => {
          logger.debug('[MMR] Got rank description (legacy)', {
            channel,
            description,
            hasDescription: description !== null && description.length > 0,
          })

          if (description === null || description.length > 0) {
            chatClient.say(channel, description ?? unknownMsg, message.user.messageId)
          } else {
            logger.debug('[MMR] Empty description, not sending message', { channel })
          }
        })
        .catch((error) => {
          logger.error('[MMR] Failed to get rank description', { channel, error })
        })
      return
    }

    const act = client.SteamAccount.find((a) => a.steam32Id === client.steam32Id)
    logger.debug('[MMR] Finding active Steam account', {
      accountDetails: act ? { mmr: act.mmr, name: act.name, steam32Id: act.steam32Id } : null,
      channel,
      currentSteam32Id: client.steam32Id,
      foundAccount: !!act,
      multiAccount: message.channel.client.multiAccount,
    })

    if (!act) {
      chatClient.say(
        channel,
        message.channel.client.multiAccount
          ? t('multiAccount', {
              lng: message.channel.client.locale,
              url: 'dotabod.com/dashboard/features',
            })
          : t('unknownSteam', { lng: message.channel.client.locale }),
        message.user.messageId
      )
      return
    }

    logger.debug('[MMR] Getting rank description for account', {
      accountName: act.name,
      channel,
      mmr: act.mmr,
      steam32Id: act.steam32Id,
    })

    getRankDescription({
      locale: client.locale,
      mmr: act.mmr,
      showRankMmr,
      steam32Id: act.steam32Id,
    })
      .then((description) => {
        logger.debug('[MMR] Got rank description', {
          accountName: act.name,
          channel,
          description,
          hasDescription: description !== null && description.length > 0,
        })

        if (description === null || description.length > 0) {
          const msg = act.name ? (description ?? unknownMsg) : ''
          logger.debug('[MMR] Sending message', { channel, message: msg || unknownMsg })
          chatClient.say(channel, msg || unknownMsg, message.user.messageId)
        } else {
          logger.debug('[MMR] Empty description and conditions not met, not sending message', {
            channel,
          })
        }
      })
      .catch((error) => {
        logger.error('[MMR] Failed to get rank description', { channel, error })
      })
  },
})
