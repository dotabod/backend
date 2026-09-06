import { moderateText } from '@dotabod/profanity-filter'
import { logger } from '@dotabod/shared-utils'
import { t } from 'i18next'

import { getDotabodRankProfile, getRankDescription, getRankTitle } from '../../dota/lib/ranks'
import { DBSettings, getValueOrDefault } from '../../settings'
import type { SocketClient } from '../../types'
import { chatClient } from '../chat-client'
import commandHandler from '../lib/command-handler'
import type { MessageType } from '../lib/command-handler'

type SteamAccount = SocketClient['SteamAccount'][number]

const sendChatterRank = async function sendChatterRank(
  message: MessageType,
  username: string
): Promise<void> {
  const { name: channel, client } = message.channel
  logger.debug('[MMR] Looking up username', { channel, username })
  const rankProfile = await getDotabodRankProfile(username)
  logger.debug('[MMR] Dotabod rank profile result', {
    found: rankProfile !== null,
    profile: rankProfile,
    username,
  })

  if (rankProfile === null) {
    const moderatedUsername = await moderateText(username)
    chatClient.say(
      channel,
      t('chattersRankUnknown', {
        lng: client.locale,
        url: 'dotabod.com/verify',
        username:
          moderatedUsername !== undefined && moderatedUsername.length > 0
            ? moderatedUsername
            : username,
      })
    )
    return
  }

  const leaderboardRank =
    rankProfile.leaderboard_rank > 0 ? ` #${rankProfile.leaderboard_rank}` : ''
  chatClient.say(
    channel,
    t('chattersRank', {
      lng: client.locale,
      rank: `${getRankTitle(rankProfile.rank_tier)}${leaderboardRank}`,
      username,
    }),
    message.user.messageId
  )
}

const sendLegacyRank = async function sendLegacyRank(
  message: MessageType,
  showRankMmr: boolean,
  unknownMessage: string
): Promise<void> {
  const { name: channel, client } = message.channel
  logger.debug('[MMR] Using legacy MMR data', {
    channel,
    mmr: client.mmr,
    steam32Id: client.steam32Id,
  })
  try {
    const description = await getRankDescription({
      locale: client.locale,
      mmr: client.mmr,
      showRankMmr,
      steam32Id: client.steam32Id ?? undefined,
    })
    logger.debug('[MMR] Got rank description (legacy)', {
      channel,
      description,
      hasDescription: description !== null && description.length > 0,
    })
    if (description === null || description.length > 0) {
      chatClient.say(channel, description ?? unknownMessage, message.user.messageId)
    } else {
      logger.debug('[MMR] Empty description, not sending message', { channel })
    }
  } catch (error) {
    logger.error('[MMR] Failed to get rank description', { channel, error })
  }
}

const sendAccountRank = async function sendAccountRank(
  message: MessageType,
  account: SteamAccount,
  showRankMmr: boolean,
  unknownMessage: string
): Promise<void> {
  const { name: channel, client } = message.channel
  logger.debug('[MMR] Getting rank description for account', {
    accountName: account.name,
    channel,
    mmr: account.mmr,
    steam32Id: account.steam32Id,
  })
  try {
    const description = await getRankDescription({
      locale: client.locale,
      mmr: account.mmr,
      showRankMmr,
      steam32Id: account.steam32Id,
    })
    logger.debug('[MMR] Got rank description', {
      accountName: account.name,
      channel,
      description,
      hasDescription: description !== null && description.length > 0,
    })
    if (description === null || description.length > 0) {
      const accountMessage =
        account.name !== null && account.name.length > 0 ? (description ?? unknownMessage) : ''
      const messageText = accountMessage.length > 0 ? accountMessage : unknownMessage
      logger.debug('[MMR] Sending message', { channel, message: messageText })
      chatClient.say(channel, messageText, message.user.messageId)
    } else {
      logger.debug('[MMR] Empty description and conditions not met, not sending message', {
        channel,
      })
    }
  } catch (error) {
    logger.error('[MMR] Failed to get rank description', { channel, error })
  }
}

const sendMissingAccount = function sendMissingAccount(message: MessageType): void {
  const { name: channel, client } = message.channel
  const hasMultipleAccounts = client.multiAccount !== undefined && client.multiAccount !== 0
  const translationKey = hasMultipleAccounts ? 'multiAccount' : 'unknownSteam'
  chatClient.say(
    channel,
    t(translationKey, {
      lng: client.locale,
      url: 'dotabod.com/dashboard/features',
    }),
    message.user.messageId
  )
}

const sendStreamerRank = async function sendStreamerRank(message: MessageType): Promise<void> {
  const { name: channel, client } = message.channel
  const mmrEnabled = getValueOrDefault(DBSettings.commandMmr, client.settings, client.subscription)
  if (!mmrEnabled) {
    logger.debug('[MMR] Command is disabled, exiting', { channel })
    return
  }

  const showRankMmr = getValueOrDefault(
    DBSettings.showRankMmr,
    client.settings,
    client.subscription
  )
  logger.debug('[MMR] Getting streamer rank', {
    channel,
    hasSteamAccounts: client.SteamAccount.length > 0,
    mmr: client.mmr,
    showRankMmr,
    steam32Id: client.steam32Id,
  })
  const unknownMessage = t('uknownMmr', {
    channel: channel.replace(/^#/u, '').toLowerCase(),
    lng: client.locale,
    url: 'dotabod.com/dashboard/features',
  })

  if (client.SteamAccount.length === 0) {
    logger.debug('[MMR] No Steam accounts found', { channel, mmr: client.mmr })
    if (client.mmr === 0) {
      logger.debug('[MMR] MMR is 0, sending unknown message', { channel })
      chatClient.say(channel, unknownMessage, message.user.messageId)
      return
    }
    await sendLegacyRank(message, showRankMmr, unknownMessage)
    return
  }

  const account = client.SteamAccount.find((entry) => entry.steam32Id === client.steam32Id)
  logger.debug('[MMR] Finding active Steam account', {
    accountDetails: account
      ? { mmr: account.mmr, name: account.name, steam32Id: account.steam32Id }
      : null,
    channel,
    currentSteam32Id: client.steam32Id,
    foundAccount: account !== undefined,
    multiAccount: client.multiAccount,
  })
  if (!account) {
    sendMissingAccount(message)
    return
  }
  await sendAccountRank(message, account, showRankMmr, unknownMessage)
}

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  dbkey: DBSettings.commandMmr,
  handler: async (message: MessageType, args: string[]) => {
    logger.debug('[MMR] Command triggered', { args, channel: message.channel.name })
    if (args.length > 0) {
      const username = args[0].toLowerCase().replace(/^@/u, '')
      await sendChatterRank(message, username)
      return
    }
    await sendStreamerRank(message)
  },
})
