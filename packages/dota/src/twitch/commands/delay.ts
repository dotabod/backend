import { DBSettings, getValueOrDefault } from '@dotabod/settings'
import { t } from 'i18next'

import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('delay', {
  aliases: ['streamdelay'],
  onlyOnline: true,
  dbkey: DBSettings.commandDelay,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    const delay = Number(getValueOrDefault(DBSettings.streamDelay, client.settings)) || 0

    chatClient.say(
      channel,
      delay / 1000 <= 0
        ? t('streamDelayNone', { lng: message.channel.client.locale })
        : t('streamDelay', { lng: message.channel.client.locale, seconds: delay / 1000 }),
    )
    return
  },
})
