import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('commands', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel },
    } = message

    void chatClient.say(
      channel,
      `Available commands: ${Array.from(commandHandler.commands.keys()).join(' | ')}`,
    )
  },
})
