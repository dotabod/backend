import { chatClient } from '../index.js'
import commandHandler, { MessageType } from '../lib/CommandHandler.js'

commandHandler.registerCommand('dotabod', {
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
