import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

export const modMode = new Set()

commandHandler.registerCommand('modsonly', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (modMode.has(channelId)) {
      void chatClient.say(channel, 'Mods only mode disabled Sadge')
      modMode.delete(channelId)
      return
    }

    if (!getValueOrDefault(DBSettings.commandModsonly, client.settings)) {
      return
    }

    // Delete all messages that are not from a mod
    modMode.add(channelId)
    void chatClient.say(channel, '/subscribers')
    void chatClient.say(channel, 'Mods only mode enabled BASED Clap')
  },
})
