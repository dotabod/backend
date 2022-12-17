import { DBSettings, getValueOrDefault } from '../../db/settings.js'
import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from '../index.js'

export const plebMode = new Set()

commandHandler.registerCommand('pleb', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId, client },
    } = message
    if (!getValueOrDefault(DBSettings.commandPleb, client.settings)) {
      return
    }

    plebMode.add(channelId)
    void chatClient.say(channel, '/subscribersoff')
    void chatClient.say(channel, 'One pleb IN 👇')
    return
  },
})
