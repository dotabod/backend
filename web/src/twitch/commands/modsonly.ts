import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { modMode } from '../../dota/lib/consts.js'
import { chatClient } from '../index.js'
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
      void chatClient.say(channel, t('modsOnly', { context: 'off', lng: client.locale }))
      void chatClient.say(channel, '/emoteonlyoff')
      void chatClient.say(channel, '/subscribersoff')
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, '/emoteonly')
    void chatClient.say(channel, t('modsOnly', { context: 'on', lng: client.locale }))
  },
})
