import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chatClient'
import commandHandler from '../lib/CommandHandler';
import type { MessageType } from '../lib/CommandHandler';

commandHandler.registerCommand('delay', {
  aliases: ['streamdelay'],
  dbkey: DBSettings.commandDelay,
  handler: (message: MessageType, _args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    const delay =
      Number(getValueOrDefault(DBSettings.streamDelay, client.settings, client.subscription)) || 0

    chatClient.say(
      channel,
      delay / 1000 <= 0
        ? t('streamDelayNone', { lng: message.channel.client.locale })
        : t('streamDelay', { lng: message.channel.client.locale, seconds: delay / 1000 }),
      message.user.messageId
    )
    return
  },
  onlyOnline: true,
})
