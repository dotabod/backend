import { t } from 'i18next'

import { getWL } from '../../db/getWL.js'
import { DBSettings } from '../../db/settings.js'
import { logger } from '../../utils/logger.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('wl', {
  aliases: ['score', 'winrate', 'wr'],

  onlyOnline: true,
  dbkey: DBSettings.commandWL,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message

    if (!client.steam32Id) {
      void chatClient.say(channel, t('unknownSteam', { lng: client.locale }))
      return
    }

    logger.info('[WL] Checking WL for steam32Id', {
      steam32Id: client.steam32Id,
      name: client.name,
    })

    getWL(channelId, client.stream_start_date)
      .then((res: any) => {
        if (res?.msg) {
          void chatClient.say(channel, res.msg)
        }
      })
      .catch((e) => {
        logger.error('[WL] Error getting WL', { error: e, channelId, name: client.name })
      })
  },
})
