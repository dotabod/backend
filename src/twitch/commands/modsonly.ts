import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

export const modMode = new Set()

commandHandler.registerCommand('modsonly', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message
    if (modMode.has(channel)) {
      void chatClient.say(channel, 'Mods only mode disabled Sadge')
      modMode.delete(channel)
      return
    }

    if (!getValueOrDefault(DBSettings.commandModsonly, client.settings)) {
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channel)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, 'Mods only mode enabled BASED Clap')
  },
})
