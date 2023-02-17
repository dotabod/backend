import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { plebMode } from '../../dota/lib/consts.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('pleb', {
  permission: 2,
  dbkey: DBSettings.commandPleb,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId },
    } = message
    plebMode.add(channelId)
    chatClient.say(channel, '/subscribersoff')
    chatClient.say(channel, t('pleb', { emote: '👇', lng: message.channel.client.locale }))
    return
  },
})
