import { DBSettings } from '@dotabod/settings'
import { t } from 'i18next'

import { modMode } from '../../dota/lib/consts.js'
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
      chatClient.say(message.channel.name, t('modsOnly', { context: 'off', lng: client.locale }))
      chatClient.say(message.channel.name, '/emoteonlyoff')
      chatClient.say(message.channel.name, '/subscribersoff')
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    chatClient.say(message.channel.name, '/subscribers')
    chatClient.say(message.channel.name, '/emoteonly')
    chatClient.say(
      message.channel.name,
      t('modsOnly', { emote: 'BASED Clap', context: 'on', lng: client.locale }),
    )
  },
})
