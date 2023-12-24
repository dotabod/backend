import { t } from 'i18next'

import { modMode } from '../../dota/lib/consts.js'
import { DBSettings } from '../../settings.js'
import { chatClient } from '../chatClient.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('modsonly', {
  aliases: ['modsonlyoff', 'modsonlyon'],
  permission: 2,
  cooldown: 0,
  dbkey: DBSettings.commandModsonly,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (modMode.has(channelId)) {
      modMode.delete(channelId)
      chatClient.say(channel, t('modsOnly', { context: 'off', lng: client.locale }))
      chatClient.say(channel, '/emoteonlyoff')
      chatClient.say(channel, '/subscribersoff')
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    chatClient.say(channel, '/subscribers')
    chatClient.say(channel, '/emoteonly')
    chatClient.say(
      channel,
      t('modsOnly', { emote: 'BASED Clap', context: 'on', lng: client.locale }),
    )
  },
})
