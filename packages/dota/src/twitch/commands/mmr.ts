import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { toUserName } from '@twurple/chat'
import { t } from 'i18next'

import { getRankDescription } from '../../dota/lib/ranks.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('mmr', {
  aliases: ['rank', 'medal'],
  dbkey: DBSettings.commandMmr,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    // If connected, we can just respond with the cached MMR
    const showRankMmr = getValueOrDefault(DBSettings.showRankMmr, client.settings)

    const unknownMsg = t('uknownMmr', {
      channel: toUserName(channel),
      url: 'dotabod.com/dashboard/features',
      lng: message.channel.client.locale,
    })

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      if (client.mmr === 0) {
        chatClient.say(channel, unknownMsg)
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
            chatClient.say(channel, description ?? unknownMsg)
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
          const msg = act.name ? description ?? unknownMsg : ''
          chatClient.say(channel, msg || unknownMsg)
        }
      })
      .catch((e) => {
        logger.info('[MMR] Failed to get rank description', { e, channel })
      })
  },
})
