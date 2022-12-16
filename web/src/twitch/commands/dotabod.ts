import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

commandHandler.registerCommand('dotabod', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel, client },
    } = message

    void chatClient.say(
      channel,
      `I'm an open source bot made by @techleed. More info: https://dotabod.com`,
    )
  },
})
