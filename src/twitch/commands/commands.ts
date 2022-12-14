import { chatClient } from '../index.js'
import commandHandler, { MessageType } from './CommandHandler.js'

commandHandler.registerCommand('commands', {
  aliases: [],
  permission: 0,
  cooldown: 15000,
  handler: (message: MessageType, args: string[]) => {
    const {
      channel: { name: channel },
    } = message
    // TODO: respond only with commands that are enabled for the channel
    // TODO: only commands user can use

    void chatClient.say(
      channel,
      `Available commands: ${Array.from(commandHandler.commands.keys()).join(' · ')}`,
    )
  },
})
