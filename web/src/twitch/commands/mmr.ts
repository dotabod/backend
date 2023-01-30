import { toUserName } from '@twurple/chat'
import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { getRankDescription } from '../../dota/lib/ranks.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
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
    const showRankLeader = getValueOrDefault(DBSettings.showRankLeader, client.settings)

    const unknownMsg = t('uknownMmr', {
      channel: toUserName(channel),
      url: 'dotabod.com/dashboard/features',
      lng: message.channel.client.locale,
    })

    // Didn't have a new account made yet on the new steamaccount table
    if (!client.SteamAccount.length) {
      if (client.mmr === 0) {
        void chatClient.say(channel, unknownMsg)
        return
      }

      getRankDescription({
        locale: client.locale,
        mmr: client.mmr,
        steam32Id: client.steam32Id ?? undefined,
        showRankMmr,
        showRankLeader,
      })
        .then((description) => {
          void chatClient.say(channel, description ?? unknownMsg)
        })
        .catch((e) => {
          logger.info('[MMR] Failed to get rank description', { e, channel })
        })
      return
    }

    const act = client.SteamAccount.find((a) => a.steam32Id === client.steam32Id)
    if (!act) {
      void chatClient.say(channel, t('unknownSteam', { lng: message.channel.client.locale }))
      return
    }

    getRankDescription({
      locale: client.locale,
      mmr: act.mmr,
      steam32Id: act.steam32Id,
      showRankMmr,
      showRankLeader,
    })
      .then((description) => {
        const msg = act.name ? description ?? unknownMsg : ''
        void chatClient.say(channel, msg || unknownMsg)
      })
      .catch((e) => {
        logger.info('[MMR] Failed to get rank description', { e, channel })
      })
  },
})
