import commandHandler, { MessageType } from './CommandHandler.js'

import { chatClient } from './index.js'

// Register a "ping" command that sends a "pong" message to the chat
commandHandler.registerCommand('ping', {
  aliases: [], // The "ping" command has no aliases
  permission: 0, // The "ping" command requires no special permission
  cooldown: 15000, // The "ping" command has a cooldown of 15 seconds
  handler: (message: MessageType, args: string[]) => {
    // Send a "pong" message to the chat
    void chatClient.say(message.channel.name, 'Pong EZ Clap (new)')
  },
})
