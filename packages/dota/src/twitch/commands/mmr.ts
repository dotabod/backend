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

    logger.info('[MMR] Command triggered', { channel, args })

    // Check if args include a twitch username
    if (args.length > 0) {
      const username = args[0].toLowerCase().replace(/^@/, '')
      logger.info('[MMR] Looking up username', { username, channel })

      const openDotaProfile = await getOpenDotaProfile(username)
      logger.info('[MMR] OpenDota profile result', {
        username,
        found: openDotaProfile !== null,
        profile: openDotaProfile,
      })

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
    logger.info('[MMR] Command enabled check', {
      channel,
      mmrDisabled,
      settings: client.settings,
    })

    if (mmrDisabled) {
      logger.info('[MMR] Command is disabled, exiting', { channel })
      return
    }

    // If connected, we can just respond with the cached MMR
    const showRankMmr = getValueOrDefault(
      DBSettings.showRankMmr,
      client.settings,
      client.subscription,
    )
    const name = channel.replace(/^#/, '').toLowerCase()

    logger.info('[MMR] Getting streamer rank', {
      channel,
      showRankMmr,
      steam32Id: client.steam32Id,
      mmr: client.mmr,
      hasSteamAccounts: client.SteamAccount?.length > 0,
    })

    const unknownMsg = t('uknownMmr', {
      channel: name,
      url: 'dotabod.com/dashboard/features',
      lng: message.channel.client.locale,
    })

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      logger.info('[MMR] No Steam accounts found', { channel, mmr: client.mmr })

      if (client.mmr === 0) {
        logger.info('[MMR] MMR is 0, sending unknown message', { channel })
        chatClient.say(channel, unknownMsg, message.user.messageId)
        return
      }

      logger.info('[MMR] Using legacy MMR data', {
        channel,
        mmr: client.mmr,
        steam32Id: client.steam32Id,
      })

      getRankDescription({
        locale: client.locale,
        mmr: client.mmr,
        steam32Id: client.steam32Id ?? undefined,
        showRankMmr,
      })
        .then((description) => {
          logger.info('[MMR] Got rank description (legacy)', {
            channel,
            description,
            hasDescription: description !== null && description.length > 0,
          })

          if (description === null || description.length > 0) {
            chatClient.say(channel, description ?? unknownMsg, message.user.messageId)
          } else {
            logger.info('[MMR] Empty description, not sending message', { channel })
          }
        })
        .catch((e) => {
          logger.error('[MMR] Failed to get rank description', { error: e, channel })
        })
      return
    }

    const act = client.SteamAccount.find((a) => a.steam32Id === client.steam32Id)
    logger.info('[MMR] Finding active Steam account', {
      channel,
      currentSteam32Id: client.steam32Id,
      foundAccount: !!act,
      accountDetails: act ? { name: act.name, mmr: act.mmr, steam32Id: act.steam32Id } : null,
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
        message.user.messageId,
      )
      return
    }

    logger.info('[MMR] Getting rank description for account', {
      channel,
      accountName: act.name,
      mmr: act.mmr,
      steam32Id: act.steam32Id,
    })

    getRankDescription({
      locale: client.locale,
      mmr: act.mmr,
      steam32Id: act.steam32Id,
      showRankMmr,
    })
      .then((description) => {
        logger.info('[MMR] Got rank description', {
          channel,
          description,
          hasDescription: description !== null && description.length > 0,
          accountName: act.name,
        })

        if (description === null || description.length > 0) {
          const msg = act.name ? (description ?? unknownMsg) : ''
          logger.info('[MMR] Sending message', { channel, message: msg || unknownMsg })
          chatClient.say(channel, msg || unknownMsg, message.user.messageId)
        } else {
          logger.info('[MMR] Empty description and conditions not met, not sending message', {
            channel,
          })
        }
      })
      .catch((e) => {
        logger.error('[MMR] Failed to get rank description', { error: e, channel })
      })
  },
})
