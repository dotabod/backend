import { t } from 'i18next'

import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('delay', {
  aliases: ['streamdelay'],
  onlyOnline: true,
  dbkey: DBSettings.commandDelay,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    const delay = getValueOrDefault(DBSettings.streamDelay, client.settings)

    void chatClient.say(
      channel,
      t('streamDelay', { lng: message.channel.client.locale, count: delay / 1000 }),
    )
    return
  },
})
