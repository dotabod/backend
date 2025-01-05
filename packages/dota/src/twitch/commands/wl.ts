import { t } from 'i18next'

import { getWL } from '../../db/getWL.js'
import { DBSettings, getValueOrDefault } from '../../settings.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { type MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],
  dbkey: DBSettings.commandWL,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!client.steam32Id) {
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

    const mmrEnabled = getValueOrDefault(DBSettings['mmr-tracker'], client.settings)

    getWL({
      lng: client.locale,
      channelId: channelId,
      mmrEnabled: mmrEnabled,
      startDate: client.stream_start_date,
    })
      .then((res: any) => {
        if (res?.msg) {
          chatClient.say(channel, res.msg, message.user.messageId)
        }
      })
      .catch((e) => {
        logger.error('[WL] Error getting WL', { error: e, channelId, name: client.name })
      })
  },
})
