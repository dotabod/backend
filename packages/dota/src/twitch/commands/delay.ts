import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../settings'
import { chatClient } from '../chat-client'
import type { CommandDefinition, MessageType } from '../lib/command-handler.ts'

export const delayCommand: CommandDefinition = {
  aliases: ['streamdelay'],
  dbkey: DBSettings.commandDelay,
  handler: (message: MessageType) => {
    const {
      channel: { name: channel, client },
    } = message

    const delay = getValueOrDefault(DBSettings.streamDelay, client.settings, client.subscription)

    chatClient.say(
      channel,
      delay / 1000 <= 0
        ? t('streamDelayNone', { lng: message.channel.client.locale })
        : t('streamDelay', { lng: message.channel.client.locale, seconds: delay / 1000 }),
      message.user.messageId
    )
  },
  name: 'delay',
  onlyOnline: true,
}
