import { t } from 'i18next'

import { DBSettings } from '../../db/settings.js'
import { modMode } from '../../dota/lib/consts.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('modsonly', {
  permission: 2,

  dbkey: DBSettings.commandModsonly,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (modMode.has(channelId)) {
      void chatClient.say(channel, t('modsOnly', { context: 'off', lng: client.locale }))
      modMode.delete(channelId)
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, t('modsOnly', { context: 'on', lng: client.locale }))
  },
})
