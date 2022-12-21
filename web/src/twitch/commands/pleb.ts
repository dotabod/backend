import { DBSettings } from '../../db/settings.js'
import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

export const plebMode = new Set()

commandHandler.registerCommand('pleb', {
  aliases: [],
  permission: 2,
  cooldown: 15000,
  dbkey: DBSettings.commandPleb,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, id: channelId },
    } = message
    plebMode.add(channelId)
    void chatClient.say(channel, '/subscribersoff')
    void chatClient.say(channel, 'One pleb IN 👇')
    return
  },
})
